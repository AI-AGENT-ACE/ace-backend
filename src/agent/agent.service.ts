import { Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { ConversationsService } from '../conversations/conversations.service';
import { MessageRole } from '../generated/prisma/client';
import { MessagesService } from '../messages/messages.service';
import { AgentEventKind, AgentEventsService } from '../logs/agent-events.service';
import { AgentTurnDto } from './dto/agent.dto';
import { AiServerClient } from './ports/ai-server.client';
import { AgentContextService } from './services/agent-context.service';
import { AgentResponseService } from './services/agent-response.service';

@Injectable()
export class AgentService {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    private readonly ai: AiServerClient,
    private readonly context: AgentContextService,
    private readonly responses: AgentResponseService,
    private readonly events: AgentEventsService,
  ) {}
  async turn(userId: string, input: AgentTurnDto, signal?: AbortSignal) {
    return this.events.track(AgentEventKind.TURN, async () => {
      await this.conversations.active(userId, input.conversationId);
      signal?.throwIfAborted();
      if (input.messageId) {
        const page = await this.messages.list(userId, input.conversationId, { limit: 30 });
        const latest = page.items.find((message) => message.role === MessageRole.USER);
        if (!latest || latest.id !== input.messageId || latest.content !== input.content)
          throw new AppException(409, ErrorCode.CONFLICT, 'The saved user message has changed');
      } else
        await this.messages.append(
          userId,
          input.conversationId,
          MessageRole.USER,
          input.content,
          input.attachmentIds,
        );
      signal?.throwIfAborted();
      const response = await this.ai.generate({
        ...(await this.context.build(userId, input.conversationId)),
        signal,
      });
      signal?.throwIfAborted();
      await this.conversations.applyAiTitle(userId, input.conversationId, response.title);
      signal?.throwIfAborted();
      return this.responses.deliver(userId, input.conversationId, response);
    });
  }
}
