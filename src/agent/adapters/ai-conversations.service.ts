import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JsonHttpClient } from '../../common/http/json-http.client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';

const created = z.object({ conversationId: z.string().min(1).max(128) });

@Injectable()
export class AiConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly http: JsonHttpClient,
  ) {}

  async resolve(
    userId: string,
    conversationId: string,
    serverUrl: string,
    headers: Record<string, string>,
    timeout: number,
  ) {
    // Never trust a remote conversation ID supplied by a client.
    const owned = await this.prisma.conversation.findFirst({
      where: { id: conversationId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!owned)
      throw new AppException(404, ErrorCode.CONVERSATION_NOT_FOUND, 'Conversation not found');
    const key = { conversationId_serverUrl: { conversationId, serverUrl } };
    const existing = await this.prisma.aiConversation.findUnique({ where: key });
    if (existing) return existing.remoteId;
    const result = created.parse(
      await this.http.request(`${serverUrl}/conversations`, { method: 'POST', headers }, timeout),
    );
    // The compound unique key prevents concurrent first turns from mixing sessions.
    const saved = await this.prisma.aiConversation.upsert({
      where: key,
      create: { conversationId, serverUrl, remoteId: result.conversationId },
      update: {},
    });
    return saved.remoteId;
  }
}
