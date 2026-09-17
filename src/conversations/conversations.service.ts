import { Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { cursorPage } from '../common/pagination/page.dto';
import { ConversationsRepository } from './conversations.repository';
import { ConversationQueryDto, UpdateConversationDto } from './dto/conversation.dto';

export const TRASH_RETENTION_MS = 30 * 86400 * 1000;

@Injectable()
export class ConversationsService {
  constructor(private readonly conversations: ConversationsRepository) {}
  create(userId: string, title?: string) {
    return this.conversations.create(userId, title);
  }

  async active(userId: string, id: string) {
    const conversation = await this.conversations.findActive(userId, id);
    if (!conversation)
      throw new AppException(404, ErrorCode.CONVERSATION_NOT_FOUND, 'Conversation not found');
    return conversation;
  }

  async list(userId: string, query: ConversationQueryDto, trash = false) {
    if (query.cursor && !(await this.conversations.findCursor(userId, query.cursor, trash))) {
      throw new AppException(400, ErrorCode.INVALID_CURSOR, 'Cursor is not part of this list');
    }
    const page = cursorPage(
      await this.conversations.list(userId, query.limit, query.cursor, trash),
      query.limit,
    );
    if (!trash) return page;
    return {
      ...page,
      items: page.items.map((item) => {
        const expiresAt = new Date(item.deletedAt!.getTime() + TRASH_RETENTION_MS);
        return {
          ...item,
          expiresAt,
          remainingDays: Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)),
          isRestorable: expiresAt.getTime() > Date.now(),
        };
      }),
    };
  }

  async update(userId: string, id: string, input: UpdateConversationDto) {
    const changed = await this.conversations.update(userId, id, input);
    if (!changed.count)
      throw new AppException(404, ErrorCode.CONVERSATION_NOT_FOUND, 'Conversation not found');
    return this.active(userId, id);
  }

  async softDelete(userId: string, id: string) {
    const changed = await this.conversations.softDelete(userId, id);
    if (!changed.count)
      throw new AppException(404, ErrorCode.CONVERSATION_NOT_FOUND, 'Conversation not found');
  }

  private async ownedTrash(userId: string, id: string) {
    const conversation = await this.conversations.findOwned(userId, id);
    if (!conversation)
      throw new AppException(404, ErrorCode.CONVERSATION_NOT_FOUND, 'Conversation not found');
    if (!conversation.deletedAt)
      throw new AppException(
        409,
        ErrorCode.CONVERSATION_NOT_IN_TRASH,
        'Move the conversation to trash first',
      );
    return conversation;
  }

  async restore(userId: string, id: string) {
    const conversation = await this.ownedTrash(userId, id);
    const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);
    if (conversation.deletedAt!.getTime() <= cutoff.getTime()) {
      throw new AppException(
        410,
        ErrorCode.CONVERSATION_EXPIRED,
        'The 30-day recovery period has expired',
      );
    }
    const changed = await this.conversations.restore(userId, id, cutoff);
    if (!changed.count)
      throw new AppException(
        409,
        ErrorCode.CONFLICT,
        'Conversation state changed; reload and retry',
      );
    return this.active(userId, id);
  }

  async permanentDelete(userId: string, id: string) {
    await this.ownedTrash(userId, id);
    const changed = await this.conversations.permanentDelete(userId, id);
    if (!changed.count)
      throw new AppException(
        409,
        ErrorCode.CONFLICT,
        'Conversation state changed; reload and retry',
      );
  }
}
