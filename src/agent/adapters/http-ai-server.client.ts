import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { JsonHttpClient } from '../../common/http/json-http.client';
import { ToolName } from '../../tools/catalog/tool-name';
import { AiServerClient, AiTurnRequest } from '../ports/ai-server.client';

const responseSchema = z
  .object({
    content: z.string().max(20000).optional(),
    toolCalls: z
      .array(
        z
          .object({
            id: z
              .string()
              .min(1)
              .max(128)
              .regex(/^[a-zA-Z0-9_-]+$/),
            tool: z.enum(ToolName),
            arguments: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .max(8)
      .default([]),
  })
  .strict()
  .refine((response) => Boolean(response.content) || response.toolCalls.length > 0)
  .refine(
    (response) =>
      new Set(response.toolCalls.map((call) => call.id)).size === response.toolCalls.length,
  );

@Injectable()
export class HttpAiServerClient extends AiServerClient {
  constructor(
    private readonly config: ConfigService,
    private readonly http: JsonHttpClient,
  ) {
    super();
  }
  async generate(request: AiTurnRequest) {
    const base = this.config.get<string>('AI_SERVER_URL');
    if (!base)
      throw new AppException(503, ErrorCode.AI_NOT_CONFIGURED, 'AI server is not configured');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = this.config.get<string>('AI_SERVER_API_KEY');
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    let response: unknown;
    try {
      response = await this.http.request(
        new URL('v1/turns', `${base.replace(/\/$/, '')}/`).toString(),
        {
          method: 'POST',
          headers,
          body: JSON.stringify(request),
        },
      );
    } catch {
      throw new AppException(502, ErrorCode.AI_UNAVAILABLE, 'AI server is unavailable');
    }
    const parsed = responseSchema.safeParse(response);
    if (!parsed.success)
      throw new AppException(
        502,
        ErrorCode.AI_INVALID_RESPONSE,
        'AI server returned an invalid response',
      );
    return parsed.data;
  }
}
