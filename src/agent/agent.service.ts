import { Injectable } from '@nestjs/common';
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
  async turn(userId: string, input: AgentTurnDto) {
    return this.events.track(AgentEventKind.TURN, async () => {
      await this.conversations.active(userId, input.conversationId);
      await this.messages.append(
        userId,
        input.conversationId,
        MessageRole.USER,
        input.content,
        input.attachmentIds,
      );
      const response = await this.ai.generate(
        await this.context.build(userId, input.conversationId),
      );
      return this.responses.deliver(userId, input.conversationId, response);
    });
  }
}
