import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { ConversationsService } from '../../conversations/conversations.service';
import { MessageRole, ToolExecutionStatus } from '../../generated/prisma/client';
import { LogsService } from '../../logs/logs.service';
import { AgentEventKind, AgentEventsService } from '../../logs/agent-events.service';
import { MessagesService } from '../../messages/messages.service';
import { PermissionsService } from '../../settings/permissions.service';
import { ToolCatalog } from '../../tools/catalog/tool-catalog.service';
import { ToolExecutionLocation } from '../../tools/catalog/tool-name';
import { ToolsService } from '../../tools/tools.service';
import { AgentCloudToolDto, LocalToolResultDto } from '../dto/agent.dto';
import { AiServerClient, AiToolResult } from '../ports/ai-server.client';
import { AgentContextService } from './agent-context.service';
import { AgentResponseService } from './agent-response.service';
import { ToolTicketService } from './tool-ticket.service';
import { localSearchMessage } from './local-search-result';

@Injectable()
export class AgentToolResultsService {
  constructor(
    private readonly tickets: ToolTicketService,
    private readonly catalog: ToolCatalog,
    private readonly conversations: ConversationsService,
    private readonly permissions: PermissionsService,
    private readonly tools: ToolsService,
    private readonly logs: LogsService,
    private readonly messages: MessagesService,
    private readonly ai: AiServerClient,
    private readonly context: AgentContextService,
    private readonly responses: AgentResponseService,
    private readonly events: AgentEventsService,
  ) {}

  async local(userId: string, input: LocalToolResultDto) {
    const claims = await this.tickets.verify(userId, input.ticket);
    if (input.executionId && input.executionId !== claims.callId)
      throw new AppException(
        400,
        ErrorCode.INVALID_TOOL_TICKET,
        'Execution ID differs from the issued ticket',
      );
    await this.conversations.active(userId, claims.conversationId);
    if (input.attemptId)
      await this.tickets.validateResultAttempt(
        userId,
        claims.callId,
        input.attemptId,
        input.status,
      );
    if (this.catalog.get(claims.toolName).executionLocation !== ToolExecutionLocation.LOCAL) {
      throw new AppException(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Cloud results must come from server-side execution',
      );
    }
    const policy = await this.permissions.effective(userId, claims.toolName);
    if (policy.denied && input.status !== ToolExecutionStatus.DENIED) {
      throw new AppException(403, ErrorCode.TOOL_PERMISSION_DENIED, 'Tool permission is denied');
    }
    if (
      input.status === ToolExecutionStatus.SUCCEEDED &&
      policy.requiresConfirmation &&
      !input.confirmed
    ) {
      throw new AppException(
        409,
        ErrorCode.TOOL_CONFIRMATION_REQUIRED,
        'Explicit confirmation is required',
      );
    }
    let result = input.result;
    if (claims.toolName === 'clipboard.read' && input.status === ToolExecutionStatus.SUCCEEDED) {
      const text = input.result?.text;
      if (
        typeof text !== 'string' ||
        Buffer.byteLength(text, 'utf8') > 65536 ||
        text.includes('\0')
      )
        throw new AppException(
          400,
          ErrorCode.VALIDATION_ERROR,
          'Clipboard text result is missing or invalid',
        );
      result = { text };
    }
    try {
      await this.logs.record({
        userId,
        toolName: claims.toolName,
        status: input.status,
        errorCode: input.errorCode,
        duration: input.duration,
        executionId: claims.callId,
        requestId: claims.requestId,
        attemptId: input.attemptId,
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw new AppException(
          409,
          ErrorCode.CONFLICT,
          'Execution result has already been consumed',
        );
      throw error;
    }
    return this.resume(userId, claims.conversationId, {
      callId: claims.callId,
      tool: claims.toolName,
      status: input.status,
      result,
    });
  }

  async cloud(userId: string, input: AgentCloudToolDto) {
    const claims = await this.tickets.verify(userId, input.ticket);
    await this.conversations.active(userId, claims.conversationId);
    if (this.catalog.get(claims.toolName).executionLocation !== ToolExecutionLocation.CLOUD) {
      throw new AppException(
        400,
        ErrorCode.LOCAL_EXECUTION_NOT_SUPPORTED,
        'Local tools must be executed by the desktop runtime',
      );
    }
    const arguments_ = this.catalog.validateArguments(claims.toolName, input.arguments);
    if (this.tickets.digest(arguments_) !== claims.argumentsDigest) {
      throw new AppException(
        400,
        ErrorCode.INVALID_TOOL_ARGUMENTS,
        'Arguments differ from the issued tool call',
      );
    }
    const execution = await this.tools.execute(userId, {
      toolName: claims.toolName,
      arguments: arguments_,
      confirmed: input.confirmed,
    });
    return this.resume(userId, claims.conversationId, {
      callId: claims.callId,
      tool: claims.toolName,
      status: ToolExecutionStatus.SUCCEEDED,
      result: execution.result,
    });
  }

  private async resume(userId: string, conversationId: string, result: AiToolResult) {
    return this.events.track(AgentEventKind.TOOL_RESULT, async () => {
      // Store only a normalized result marker; raw tool output is sent to AI transiently.
      await this.messages.append(
        userId,
        conversationId,
        MessageRole.TOOL,
        `${result.tool}: ${result.status}`,
      );
      const localMessage =
        result.status === ToolExecutionStatus.FAILED &&
        (result.result as { failureReason?: string } | undefined)?.failureReason ===
          'NATIVE_APPROVAL_EXPIRED'
          ? '승인 시간이 만료되어 실행하지 않았습니다.'
          : localSearchMessage(result.tool, result.status, result.result);
      if (localMessage) {
        // Keep the AI conversation informed with metadata only. Its prose or
        // connectivity must not replace a completed local search with a failure.
        try {
          await this.ai.generate(await this.context.build(userId, conversationId, [result]));
        } catch {
          // The verified Native result remains authoritative for this operation.
        }
        return this.responses.deliver(userId, conversationId, {
          content: localMessage,
          toolCalls: [],
        });
      }
      const response = await this.ai.generate(
        await this.context.build(userId, conversationId, [result]),
      );
      return this.responses.deliver(userId, conversationId, response);
    });
  }
}
