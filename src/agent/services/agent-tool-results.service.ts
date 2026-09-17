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
    await this.conversations.active(userId, claims.conversationId);
    if (this.catalog.get(claims.toolName).executionLocation !== ToolExecutionLocation.LOCAL) {
      throw new AppException(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Cloud results must come from server-side execution',
      );
    }
    const policy = await this.permissions.effective(userId, claims.toolName);
    if (
      input.status !== ToolExecutionStatus.DENIED &&
      policy.requiresConfirmation &&
      !input.confirmed
    ) {
      throw new AppException(
        409,
        ErrorCode.TOOL_CONFIRMATION_REQUIRED,
        'Explicit confirmation is required',
      );
    }
    await this.logs.record({
      userId,
      toolName: claims.toolName,
      status: input.status,
      errorCode: input.errorCode,
      duration: input.duration,
    });
    return this.resume(userId, claims.conversationId, {
      callId: claims.callId,
      tool: claims.toolName,
      status: input.status,
      result: input.result,
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
      const response = await this.ai.generate(
        await this.context.build(userId, conversationId, [result]),
      );
      return this.responses.deliver(userId, conversationId, response);
    });
  }
}
