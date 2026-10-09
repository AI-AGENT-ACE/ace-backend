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
    let conversationId: string;
    const result = request.toolResults?.at(-1);
    try {
      conversationId = await this.conversations.resolve(
        request.userId,
        request.conversationId,
        base,
        headers,
        timeout,
      );
      const body = result
        ? {
            conversationId,
            tool: result.tool,
            status: result.status === 'SUCCEEDED' ? 'success' : 'failure',
            ...(result.status === 'SUCCEEDED'
              ? { result: result.result ?? {} }
              : {
                  error: { status: result.status },
                  message:
                    result.status === 'DENIED'
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
    if ('conversationId' in parsed.data && parsed.data.conversationId !== conversationId)
      throw new AppException(502, ErrorCode.AI_INVALID_RESPONSE, 'AI conversation mismatch');
    const title = 'title' in parsed.data ? parsed.data.title : undefined;
    if (response.type === 'message') return { title, content: response.content, toolCalls: [] };
    if (response.type === 'tool_sequence') return { content: unsupportedSequence, toolCalls: [] };
    if (
      response.tool === ToolName.WEATHER_CURRENT ||
      !Object.values(ToolName).includes(response.tool as ToolName)
    )
      return {
        content: `현재 채팅에서 지원하지 않는 도구입니다: ${response.tool}.`,
        toolCalls: [],
      };
    // Translate only app aliases. Existing argument validation and signed tickets still apply.
    let arguments_ = response.arguments;
    if (response.tool === ToolName.APP_OPEN || response.tool === ToolName.APP_CLOSE) {
      const appName = arguments_.appName ?? arguments_.canonicalId ?? arguments_.original;
      arguments_ = { appName };
    }
    return {
      title,
      toolCalls: [{ id: randomUUID(), tool: response.tool as ToolName, arguments: arguments_ }],
    };
  }
}
