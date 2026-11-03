import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { ToolName } from '../../tools/catalog/tool-name';
import { AiToolCall } from '../ports/ai-server.client';
import { PrismaService } from '../../common/prisma/prisma.service';

const claimsSchema = z.object({
  type: z.literal('tool-handoff'),
  sub: z.string(),
  conversationId: z.string(),
  callId: z.string(),
  requestId: z.string().optional(),
  executionId: z.string().optional(),
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
    private readonly prisma: PrismaService,
  ) {}
  digest(arguments_: Record<string, unknown>) {
    return createHash('sha256')
      .update(JSON.stringify(canonical(arguments_)))
      .digest('hex');
  }
  async issue(userId: string, conversationId: string, call: AiToolCall, requestId = call.id) {
    await this.prisma.nativeExecution.create({
      data: {
        id: call.id,
        userId,
        requestId,
        toolName: call.tool,
        expiresAt: new Date(Date.now() + 900000),
      },
    });
    return this.jwt.signAsync(
      {
        type: 'tool-handoff',
        sub: userId,
        conversationId,
        callId: call.id,
        executionId: call.id,
        requestId,
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
  async history(userId: string, executionId: string) {
    const record = await this.prisma.nativeExecution.findFirst({
      where: { id: executionId, userId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!record) throw new AppException(404, ErrorCode.VALIDATION_ERROR, 'Execution not found');
    if (
      record.expiresAt < new Date() &&
      !['SUCCEEDED', 'FAILED', 'DENIED', 'CANCELLED', 'EXPIRED'].includes(record.state)
    ) {
      await this.prisma.nativeExecution.updateMany({
        where: { id: executionId, state: record.state },
        data: { state: 'EXPIRED' },
      });
      return this.prisma.nativeExecution.findFirst({
        where: { id: executionId, userId },
        include: { events: { orderBy: { createdAt: 'asc' } } },
      });
    }
    return record;
  }
  async validateResultAttempt(
    userId: string,
    executionId: string,
    attemptId: string,
    status: string,
  ) {
    const record = await this.prisma.nativeExecution.findFirst({
      where: { id: executionId, userId },
      include: { events: { where: { attemptId } } },
    });
    const expected = status === 'DENIED' ? ['DENIED', 'CANCELLED'] : [status];
    if (
      !record ||
      !expected.includes(record.state) ||
      !record.events.some((event) => expected.includes(event.state))
    ) {
      throw new AppException(
        409,
        ErrorCode.CONFLICT,
        'Result does not match the execution attempt',
      );
    }
  }
  async event(
    userId: string,
    ticket: string,
    attemptId: string,
    state: string,
    previousAttemptId?: string,
  ) {
    const claims = await this.verify(userId, ticket);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ state: string }>
      >`SELECT "state" FROM "NativeExecution" WHERE "id"=${claims.callId} AND "userId"=${userId} FOR UPDATE`;
      if (!rows.length)
        throw new AppException(404, ErrorCode.VALIDATION_ERROR, 'Execution not found');
      const existing = await tx.nativeExecutionEvent.findUnique({
        where: { executionId_attemptId_state: { executionId: claims.callId, attemptId, state } },
      });
      if (existing) return existing;
      if (['SUCCEEDED', 'DENIED', 'CANCELLED', 'EXPIRED'].includes(rows[0]!.state))
        throw new AppException(409, ErrorCode.CONFLICT, 'Execution already finished');
      if (previousAttemptId) {
        const previous = await tx.nativeExecutionEvent.findFirst({
          where: { executionId: claims.callId, attemptId: previousAttemptId },
        });
        if (!previous || previousAttemptId === attemptId)
          throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Invalid previous attempt');
      }
      const attemptEvents = await tx.nativeExecutionEvent.findMany({
        where: { executionId: claims.callId, attemptId },
      });
      const states = new Set(attemptEvents.map((event) => event.state));
      if (!states.size) {
        if (state !== 'REQUESTED')
          throw new AppException(409, ErrorCode.CONFLICT, 'Attempt must start with REQUESTED');
        const otherAttempt = await tx.nativeExecutionEvent.findFirst({
          where: { executionId: claims.callId },
        });
        if (otherAttempt && !previousAttemptId)
          throw new AppException(
            400,
            ErrorCode.VALIDATION_ERROR,
            'Retry must reference its previous attempt',
          );
      } else {
        const allowed =
          !['SUCCEEDED', 'FAILED', 'DENIED', 'CANCELLED', 'EXPIRED'].some((value) =>
            states.has(value),
          ) &&
          (['FAILED', 'DENIED', 'CANCELLED', 'EXPIRED'].includes(state) ||
            (state === 'WAITING_APPROVAL' && !states.has('RUNNING')) ||
            (state === 'APPROVED' && states.has('WAITING_APPROVAL') && !states.has('RUNNING')) ||
            (state === 'RUNNING' && (!states.has('WAITING_APPROVAL') || states.has('APPROVED'))) ||
            (state === 'SUCCEEDED' && states.has('RUNNING')));
        if (!allowed)
          throw new AppException(409, ErrorCode.CONFLICT, 'Invalid execution transition');
      }
      const event = await tx.nativeExecutionEvent.create({
        data: { executionId: claims.callId, attemptId, state, previousAttemptId },
      });
      await tx.nativeExecution.update({ where: { id: claims.callId }, data: { state } });
      return event;
    });
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
