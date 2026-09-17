import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ToolLogEntry } from './tool-log.types';

@Injectable()
export class LogsRepository {
  constructor(private readonly prisma: PrismaService) {}
  create(entry: ToolLogEntry) {
    return this.prisma.toolExecutionLog.create({ data: entry });
  }
  cursor(userId: string, id: string) {
    return this.prisma.toolExecutionLog.findFirst({ where: { userId, id }, select: { id: true } });
  }
  list(userId: string, limit: number, cursor?: string) {
    return this.prisma.toolExecutionLog.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }
}
