import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { JsonHttpClient } from '../common/http/json-http.client';
import { z } from 'zod';
import { modalEnvelope, unsupportedSequence } from '../agent/adapters/modal-response';
import { AiConversationsService } from '../agent/adapters/ai-conversations.service';

const voiceResult = modalEnvelope.extend({ transcript: z.string().max(20000) });

@Injectable()
export class VoiceAiClient {
  constructor(
    private readonly config: ConfigService,
    private readonly http: JsonHttpClient,
    private readonly conversations: AiConversationsService,
  ) {}
  async process(path: string, recordingId: string, userId: string, conversationId?: string) {
    const base = this.config.get<string>('AI_SERVER_URL');
    if (!base)
      throw new AppException(
        503,
        ErrorCode.AI_SERVER_UNAVAILABLE,
        'AI voice server is not configured',
      );
    const form = new FormData();
    const bytes = await readFile(path);
    form.append(
      'audio',
      new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }),
      `${recordingId}.wav`,
    );
    const headers: Record<string, string> = {};
    const key = this.config.get<string>('AI_SERVER_API_KEY');
    if (key) headers.Authorization = `Bearer ${key}`;
    try {
      const remoteId = conversationId
        ? await this.conversations.resolve(
            userId,
            conversationId,
            base.replace(/\/$/, ''),
            headers,
            this.config.getOrThrow<number>('VOICE_PROCESSING_TIMEOUT_MS'),
          )
        : undefined;
      if (remoteId) form.append('conversationId', remoteId);
      const response = await this.http.request(
        new URL('agent/voice', `${base.replace(/\/$/, '')}/`).toString(),
        { method: 'POST', headers, body: form },
        this.config.getOrThrow<number>('VOICE_PROCESSING_TIMEOUT_MS'),
      );
      const parsed = voiceResult.safeParse(response);
      if (!parsed.success || (remoteId && parsed.data.conversationId !== remoteId))
        throw new AppException(
          502,
          ErrorCode.VOICE_PROCESSING_FAILED,
          'AI voice response is invalid',
        );
      const result = parsed.data.response;
      return {
        requestId: recordingId,
        transcript: parsed.data.transcript,
        ...(result.type === 'tool_sequence'
          ? { type: 'message' as const, content: unsupportedSequence }
          : result),
      };
    } catch {
      throw new AppException(502, ErrorCode.VOICE_PROCESSING_FAILED, 'AI voice processing failed');
    }
  }
}
