import { Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { cursorPage, PageQueryDto } from '../common/pagination/page.dto';
import { ConversationsService } from '../conversations/conversations.service';
import { MessageRole } from '../generated/prisma/client';
import { MessagesRepository } from './messages.repository';

@Injectable()
export class MessagesService {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesRepository,
  ) {}
  async list(userId: string, conversationId: string, query: PageQueryDto) {
    await this.conversations.active(userId, conversationId);
    if (query.cursor && !(await this.messages.findCursor(userId, conversationId, query.cursor))) {
      throw new AppException(
        400,
        ErrorCode.INVALID_CURSOR,
        'Cursor does not belong to this conversation',
      );
    }
    return cursorPage(
      await this.messages.list(userId, conversationId, query.limit, query.cursor),
      query.limit,
    );
  }
  append(userId: string, conversationId: string, role: MessageRole, content: string) {
    if (content.length < 1 || content.length > 20000)
      throw new AppException(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Message content must be 1..20000 characters',
      );
    return this.messages.append(userId, conversationId, role, content);
  }
}
