import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateConversationDto } from './dto/conversation.dto';

@Injectable()
export class ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}
  create(userId: string, title?: string) {
    return this.prisma.conversation.create({ data: { userId, title } });
  }
  findOwned(userId: string, id: string) {
    return this.prisma.conversation.findFirst({ where: { userId, id } });
  }
  findActive(userId: string, id: string) {
    return this.prisma.conversation.findFirst({ where: { userId, id, deletedAt: null } });
  }
  findCursor(userId: string, id: string, trash: boolean) {
    return this.prisma.conversation.findFirst({
      where: { userId, id, deletedAt: trash ? { not: null } : null },
    });
  }
  list(userId: string, limit: number, cursor: string | undefined, trash: boolean) {
    return this.prisma.conversation.findMany({
      where: { userId, deletedAt: trash ? { not: null } : null },
      orderBy: trash
        ? [{ deletedAt: 'desc' }, { id: 'desc' }]
        : [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }
  update(userId: string, id: string, input: UpdateConversationDto) {
    return this.prisma.conversation.updateMany({
      where: { userId, id, deletedAt: null },
      data: input,
    });
  }
  softDelete(userId: string, id: string) {
    return this.prisma.conversation.updateMany({
      where: { userId, id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }
  restore(userId: string, id: string, cutoff: Date) {
    return this.prisma.conversation.updateMany({
      where: { userId, id, deletedAt: { gt: cutoff } },
      data: { deletedAt: null },
    });
  }
  permanentDelete(userId: string, id: string) {
    return this.prisma.conversation.deleteMany({ where: { userId, id, deletedAt: { not: null } } });
  }
  expiredIds(cutoff: Date, limit: number) {
    return this.prisma.conversation.findMany({
      where: { deletedAt: { lte: cutoff } },
      orderBy: [{ deletedAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true },
    });
  }
  purge(ids: string[], cutoff: Date) {
    return this.prisma.conversation.deleteMany({
      where: { id: { in: ids }, deletedAt: { lte: cutoff } },
    });
  }
}
