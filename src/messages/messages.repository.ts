import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { MessageRole } from '../generated/prisma/client';

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}
  findCursor(userId: string, conversationId: string, id: string) {
    return this.prisma.message.findFirst({
      where: { id, conversationId, conversation: { userId, deletedAt: null } },
      select: { id: true },
    });
  }
  list(userId: string, conversationId: string, limit: number, cursor?: string) {
    return this.prisma.message.findMany({
      where: { conversationId, conversation: { userId, deletedAt: null } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        attachments: {
          where: { deletedAt: null },
          select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true },
        },
      },
    });
  }
  append(
    userId: string,
    conversationId: string,
    role: MessageRole,
    content: string,
    attachmentIds: string[] = [],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      // The conditional update locks the parent row before inserting, preventing writes after deletion.
      const parent = await transaction.conversation.updateMany({
        where: { id: conversationId, userId, deletedAt: null },
        data: { updatedAt: new Date() },
      });
      if (parent.count !== 1)
        throw new AppException(404, ErrorCode.CONVERSATION_NOT_FOUND, 'Conversation not found');
      const message = await transaction.message.create({ data: { conversationId, role, content } });
      if (attachmentIds.length) {
        const unique = [...new Set(attachmentIds)];
        if (unique.length !== attachmentIds.length)
          throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Duplicate attachment');
        const linked = await transaction.attachment.updateMany({
          where: { id: { in: unique }, userId, conversationId, messageId: null, deletedAt: null },
          data: { messageId: message.id },
        });
        if (linked.count !== unique.length)
          throw new AppException(
            403,
            ErrorCode.FORBIDDEN_ATTACHMENT_ACCESS,
            'Attachment ownership validation failed',
          );
      }
      return transaction.message.findUniqueOrThrow({
        where: { id: message.id },
        include: {
          attachments: {
            select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true },
          },
        },
      });
    });
  }
}
