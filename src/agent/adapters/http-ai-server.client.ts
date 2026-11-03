import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { JsonHttpClient } from '../../common/http/json-http.client';
import { ToolName } from '../../tools/catalog/tool-name';
import { AiServerClient, AiTurnRequest, AiTurnResponse } from '../ports/ai-server.client';
import { AiConversationsService } from './ai-conversations.service';
import { modalEnvelope, modalResponse, unsupportedSequence } from './modal-response';
import { normalizeAiToolArguments } from './normalize-ai-tool';

@Injectable()
export class HttpAiServerClient extends AiServerClient {
  constructor(
    private readonly config: ConfigService,
    private readonly http: JsonHttpClient,
    private readonly conversations: AiConversationsService,
  ) {
    super();
  }

  async generate(request: AiTurnRequest): Promise<AiTurnResponse> {
    const base = this.config.get<string>('AI_SERVER_URL')?.replace(/\/$/, '');
    if (!base)
      throw new AppException(503, ErrorCode.AI_NOT_CONFIGURED, 'AI server is not configured');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = this.config.get<string>('AI_SERVER_API_KEY');
    if (key) headers.Authorization = `Bearer ${key}`;
    const timeout = this.config.get<number>('AI_REQUEST_TIMEOUT_MS') ?? 120000;
    let data: unknown;
    let conversationId: string | undefined;
    const result = request.toolResults?.at(-1);
    try {
      conversationId = await this.conversations.lookup(
        request.userId,
        request.conversationId,
        base,
      );
      if (result && !conversationId)
        throw new AppException(502, ErrorCode.AI_INVALID_RESPONSE, 'AI conversation is missing');
      const body = result
        ? {
            conversationId,
            tool: result.tool,
            status: result.status === 'SUCCEEDED' ? 'success' : 'failure',
            ...(result.status === 'SUCCEEDED'
              ? { result: result.result ?? {} }
              : {
                  error: {
                    status: result.status,
                    ...((result.result as { failureReason?: string } | undefined)?.failureReason
                      ? { code: (result.result as { failureReason: string }).failureReason }
                      : {}),
                  },
                  message:
                    (result.result as { failureReason?: string } | undefined)?.failureReason ===
                    'NATIVE_APPROVAL_EXPIRED'
                      ? '승인 시간이 만료되어 실행하지 않았습니다.'
                      : (result.result as { failureReason?: string } | undefined)?.failureReason ===
                          'NATIVE_APPROVAL_STALE'
                        ? '승인 상태를 확인할 수 없어 실행하지 않았습니다. 사용자의 거절이 아닙니다. 새 요청이 필요합니다.'
                        : result.status === 'DENIED'
                          ? '사용자가 실행을 거절했습니다.'
                          : '도구 실행에 실패했습니다.',
                }),
          }
        : {
            conversationId,
            message: request.messages.filter((message) => message.role === 'USER').at(-1)?.content,
          };
      data = await this.http.request(
        `${base}${result ? '/agent/tool-result' : '/agent/text'}`,
        { method: 'POST', headers, body: JSON.stringify(body), signal: request.signal },
        timeout,
      );
    } catch (error) {
      request.signal?.throwIfAborted();
      if (error instanceof AppException && error.getStatus() === 404) throw error;
      throw new AppException(502, ErrorCode.AI_UNAVAILABLE, 'AI server is unavailable');
    }
    const parsed = result ? modalResponse.safeParse(data) : modalEnvelope.safeParse(data);
    if (!parsed.success)
      throw new AppException(
        502,
        ErrorCode.AI_INVALID_RESPONSE,
        'AI server returned an invalid response',
      );
    const response = 'response' in parsed.data ? parsed.data.response : parsed.data;
    if (
      'conversationId' in parsed.data &&
      conversationId &&
      parsed.data.conversationId !== conversationId
    )
      throw new AppException(502, ErrorCode.AI_INVALID_RESPONSE, 'AI conversation mismatch');
    if ('conversationId' in parsed.data) {
      await this.conversations.remember(
        request.userId,
        request.conversationId,
        base,
        parsed.data.conversationId,
      );
      conversationId = parsed.data.conversationId;
    }
    const title =
      ('title' in parsed.data ? parsed.data.title : undefined) ??
      (!result && conversationId
        ? await this.conversations.title(base, conversationId, headers, request.signal)
        : undefined);
    if (response.type === 'message') return { title, content: response.content, toolCalls: [] };
    if (response.type === 'tool_sequence')
      return { title, content: unsupportedSequence, toolCalls: [] };
    if (
      response.tool === ToolName.WEATHER_CURRENT ||
      !Object.values(ToolName).includes(response.tool as ToolName)
    )
      return {
        title,
        content: `현재 채팅에서 지원하지 않는 도구입니다: ${response.tool}.`,
        toolCalls: [],
      };
    // Translate only app aliases. Existing argument validation and signed tickets still apply.
    const arguments_ = normalizeAiToolArguments(response.tool, response.arguments);
    return {
      title,
      toolCalls: [{ id: randomUUID(), tool: response.tool as ToolName, arguments: arguments_ }],
    };
  }
}
