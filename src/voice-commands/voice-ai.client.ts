import { Injectable, Logger } from '@nestjs/common';
import { ToolCatalog } from '../tools/catalog/tool-catalog.service';
import { PermissionsService } from '../settings/permissions.service';
import { normalizeAiToolArguments, aiToolDiagnostic } from '../agent/adapters/normalize-ai-tool';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { JsonHttpClient, UpstreamHttpError } from '../common/http/json-http.client';
import { z } from 'zod';
import { modalEnvelope, unsupportedSequence } from '../agent/adapters/modal-response';
import { AiConversationsService } from '../agent/adapters/ai-conversations.service';

const voiceResult = modalEnvelope.extend({ transcript: z.string().max(20000) });

@Injectable()
export class VoiceAiClient {
  private readonly logger = new Logger(VoiceAiClient.name);
  constructor(
    private readonly config: ConfigService,
    private readonly http: JsonHttpClient,
    private readonly conversations: AiConversationsService,
    private readonly catalog: ToolCatalog,
    private readonly permissions: PermissionsService,
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
    const started = Date.now();
    let stage = 'conversation';
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
      stage = 'agent_voice';
      const upstreamStarted = Date.now();
      const response = await this.http.request(
        new URL('agent/voice', `${base.replace(/\/$/, '')}/`).toString(),
        { method: 'POST', headers, body: form },
        this.config.getOrThrow<number>('VOICE_PROCESSING_TIMEOUT_MS'),
      );
      this.logger.log({
        event: 'VOICE_AI_RESPONSE',
        recordingId,
        stage,
        durationMs: Date.now() - upstreamStarted,
      });
      stage = 'response_validation';
      const parsed = voiceResult.safeParse(response);
      if (!parsed.success || (remoteId && parsed.data.conversationId !== remoteId))
        throw new AppException(
          502,
          ErrorCode.VOICE_INVALID_RESPONSE,
          'AI voice response is invalid',
        );
      const result = parsed.data.response;
      if (result.type === 'tool_call') {
        let arguments_: Record<string, unknown>;
        try {
          arguments_ = this.catalog.validateArguments(
            result.tool,
            normalizeAiToolArguments(result.tool, result.arguments),
          );
        } catch {
          this.logger.warn({
            event: 'AI_TOOL_ARGUMENTS_REJECTED',
            recordingId,
            ...aiToolDiagnostic(result.tool, result.arguments),
            durationMs: Date.now() - started,
          });
          return {
            requestId: recordingId,
            transcript: parsed.data.transcript,
            type: 'message' as const,
            content:
              '실행할 작업 정보를 정확히 확인하지 못했습니다. 아무 작업도 실행하지 않았습니다.',
          };
        }
        stage = 'permission';
        const permission = await this.permissions.effective(userId, result.tool);
        if (permission?.denied)
          return {
            requestId: recordingId,
            transcript: parsed.data.transcript,
            type: 'message' as const,
            content: '이 작업은 권한 설정에서 차단되어 있습니다.',
          };
        return {
          requestId: recordingId,
          transcript: parsed.data.transcript,
          ...result,
          arguments: arguments_,
        };
      }
      return {
        requestId: recordingId,
        transcript: parsed.data.transcript,
        ...(result.type === 'tool_sequence'
          ? { type: 'message' as const, content: unsupportedSequence }
          : result),
      };
    } catch (error) {
      const code =
        error instanceof UpstreamHttpError
          ? error.kind === 'timeout'
            ? ErrorCode.VOICE_TIMEOUT
            : error.kind === 'invalid_json'
              ? ErrorCode.VOICE_INVALID_RESPONSE
              : ErrorCode.AI_SERVER_UNAVAILABLE
          : error instanceof AppException
            ? (error.getResponse() as { code: ErrorCode }).code
            : ErrorCode.VOICE_PROCESSING_FAILED;
      this.logger.warn({
        event: 'VOICE_AI_FAILED',
        recordingId,
        stage,
        code,
        reason: error instanceof UpstreamHttpError ? error.kind : 'processing',
        upstreamStatus: error instanceof UpstreamHttpError ? error.status : undefined,
        durationMs: Date.now() - started,
      });
      if (error instanceof AppException) throw error;
      throw new AppException(
        code === ErrorCode.VOICE_TIMEOUT ? 504 : 502,
        code,
        'AI voice processing failed',
      );
    }
  }
}
