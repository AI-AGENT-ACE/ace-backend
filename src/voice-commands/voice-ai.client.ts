import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { JsonHttpClient } from '../common/http/json-http.client';
import { z } from 'zod';

const voiceResult = z
  .object({
    requestId: z.string().min(1).max(128),
    transcript: z.string().max(20000).optional(),
    content: z.string().max(20000).optional(),
    type: z.enum(['message', 'tool_call']),
    tool: z.string().min(1).max(100).optional(),
    arguments: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((value) => value.type !== 'tool_call' || Boolean(value.tool && value.arguments));

@Injectable()
export class VoiceAiClient {
  constructor(
    private readonly config: ConfigService,
    private readonly http: JsonHttpClient,
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
    form.append('recordingId', recordingId);
    form.append('userId', userId);
    if (conversationId) form.append('conversationId', conversationId);
    const headers: Record<string, string> = {};
    const key = this.config.get<string>('AI_SERVER_API_KEY');
    if (key) headers.Authorization = `Bearer ${key}`;
    try {
      const response = await this.http.request(
        new URL('v1/voice/commands', `${base.replace(/\/$/, '')}/`).toString(),
        { method: 'POST', headers, body: form },
        this.config.getOrThrow<number>('VOICE_PROCESSING_TIMEOUT_MS'),
      );
      const parsed = voiceResult.safeParse(response);
      if (!parsed.success || parsed.data.requestId !== recordingId)
        throw new AppException(
          502,
          ErrorCode.VOICE_PROCESSING_FAILED,
          'AI voice response is invalid',
        );
      return parsed.data;
    } catch {
      throw new AppException(502, ErrorCode.VOICE_PROCESSING_FAILED, 'AI voice processing failed');
    }
  }
}
