import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class AttachmentsRepository {
  constructor(private readonly prisma: PrismaService) {}
  create(data: {
    userId: string;
    conversationId: string;
    originalName: string;
    storedName: string;
    storagePath: string;
    mimeType: string;
    size: bigint;
  }) {
    return this.prisma.attachment.create({ data });
  }
  owned(userId: string, id: string) {
    return this.prisma.attachment.findFirst({
      where: { id, userId, deletedAt: null, conversation: { deletedAt: null } },
    });
  }
  remove(userId: string, id: string) {
    return this.prisma.attachment.deleteMany({ where: { id, userId } });
  }
  pathsForConversations(ids: string[]) {
    return this.prisma.attachment.findMany({
      where: { conversationId: { in: ids } },
      select: { storagePath: true },
    });
  }
}
