import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { MessageRole } from '../../generated/prisma/client';
import { MessagesService } from '../../messages/messages.service';
import { PermissionsService } from '../../settings/permissions.service';
import { ToolCatalog } from '../../tools/catalog/tool-catalog.service';
import { AiTurnResponse } from '../ports/ai-server.client';
import { ToolTicketService } from './tool-ticket.service';

@Injectable()
export class AgentResponseService {
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
      throw new AppException(
        502,
        ErrorCode.AI_INVALID_RESPONSE,
        'AI server returned invalid tool arguments',
      );
    }
    const toolCalls = await Promise.all(
      calls.map(async (call) => ({
        id: call.id,
        tool: call.tool,
        arguments: call.arguments,
        executionLocation: this.catalog.get(call.tool).executionLocation,
        ...(await this.permissions.effective(userId, call.tool)),
        ticket: await this.tickets.issue(userId, conversationId, call),
      })),
    );
    const message = response.content
      ? await this.messages.append(userId, conversationId, MessageRole.ASSISTANT, response.content)
      : null;
    // Tool arguments are returned transiently; only assistant text is persisted here.
    return { conversationId, message, toolCalls };
  }
}
