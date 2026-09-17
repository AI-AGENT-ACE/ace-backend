import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { ToolName } from '../../tools/catalog/tool-name';
import { AiToolCall } from '../ports/ai-server.client';

const claimsSchema = z.object({
  type: z.literal('tool-handoff'),
  sub: z.string(),
  conversationId: z.string(),
  callId: z.string(),
  toolName: z.enum(ToolName),
  argumentsDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

@Injectable()
export class ToolTicketService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}
  digest(arguments_: Record<string, unknown>) {
    return createHash('sha256')
      .update(JSON.stringify(canonical(arguments_)))
      .digest('hex');
  }
  issue(userId: string, conversationId: string, call: AiToolCall) {
    return this.jwt.signAsync(
      {
        type: 'tool-handoff',
        sub: userId,
        conversationId,
        callId: call.id,
        toolName: call.tool,
        argumentsDigest: this.digest(call.arguments),
      },
      {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        algorithm: 'HS256',
        expiresIn: 900,
        issuer: 'ace-backend',
        audience: 'ace-tool-results',
      },
    );
  }
  async verify(userId: string, ticket: string) {
    try {
      const claims = claimsSchema.parse(
        await this.jwt.verifyAsync(ticket, {
          secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
          algorithms: ['HS256'],
          issuer: 'ace-backend',
          audience: 'ace-tool-results',
        }),
      );
      if (claims.sub !== userId) throw new Error('Owner mismatch');
      return claims;
    } catch {
      throw new AppException(
        401,
        ErrorCode.INVALID_TOOL_TICKET,
        'Tool ticket is invalid or expired',
      );
    }
  }
}
