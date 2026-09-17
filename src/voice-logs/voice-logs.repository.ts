import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateVoiceLogDto } from './dto/voice-log.dto';

@Injectable()
export class VoiceLogsRepository {
  constructor(private readonly prisma: PrismaService) {}
  create(userId: string, input: CreateVoiceLogDto) {
    // Explicit projection prevents future DTO fields from leaking into persistent logs.
    return this.prisma.voiceCommandExecutionLog.create({
      data: {
        userId,
        commandType: input.commandType,
        status: input.status,
        duration: input.duration,
        errorCode: input.errorCode,
      },
    });
  }
  cursor(userId: string, id: string) {
    return this.prisma.voiceCommandExecutionLog.findFirst({
      where: { userId, id },
      select: { id: true },
    });
  }
  list(userId: string, limit: number, cursor?: string) {
    return this.prisma.voiceCommandExecutionLog.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }
}
