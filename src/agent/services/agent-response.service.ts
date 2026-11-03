import { Injectable, Logger } from '@nestjs/common';
import { MessageRole } from '../../generated/prisma/client';
import { MessagesService } from '../../messages/messages.service';
import { PermissionsService } from '../../settings/permissions.service';
import { ToolCatalog } from '../../tools/catalog/tool-catalog.service';
import { AiTurnResponse } from '../ports/ai-server.client';
import { ToolTicketService } from './tool-ticket.service';
import { randomUUID } from 'node:crypto';
import { aiToolDiagnostic } from '../adapters/normalize-ai-tool';

@Injectable()
export class AgentResponseService {
  private readonly logger = new Logger(AgentResponseService.name);
  constructor(
    private readonly messages: MessagesService,
    private readonly catalog: ToolCatalog,
    private readonly permissions: PermissionsService,
    private readonly tickets: ToolTicketService,
  ) {}

  async deliver(userId: string, conversationId: string, response: AiTurnResponse) {
    let calls;
    try {
      calls = response.toolCalls.map((call) => ({
        ...call,
        arguments: this.catalog.validateArguments(call.tool, call.arguments),
      }));
    } catch {
      this.logger.warn({
        event: 'AI_TOOL_ARGUMENTS_REJECTED',
        calls: response.toolCalls.map((call) => aiToolDiagnostic(call.tool, call.arguments)),
      });
      // A malformed AI instruction must never receive a ticket or execute.
      const message = await this.messages.append(
        userId,
        conversationId,
        MessageRole.ASSISTANT,
        '실행할 파일이나 작업 정보를 정확히 확인하지 못했습니다. 파일의 위치와 이름을 포함해 다시 요청해 주세요. 아무 작업도 실행하지 않았습니다.',
      );
      return { conversationId, message, toolCalls: [] };
    }
    const requestId = randomUUID();
    const toolCalls = await Promise.all(
      calls.map(async (call) => ({
        id: call.id,
        executionId: call.id,
        requestId,
        tool: call.tool,
        arguments: call.arguments,
        executionLocation: this.catalog.get(call.tool).executionLocation,
        ...(await this.permissions.effective(userId, call.tool)),
        ticket: await this.tickets.issue(userId, conversationId, call, requestId),
      })),
    );
    const message = response.content
      ? await this.messages.append(userId, conversationId, MessageRole.ASSISTANT, response.content)
      : null;
    // Tool arguments are returned transiently; only assistant text is persisted here.
    return { conversationId, message, toolCalls };
  }
}
