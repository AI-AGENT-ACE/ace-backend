import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { ErrorCode } from './error-code';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    let statusCode = 500;
    let code: string = ErrorCode.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'An unexpected error occurred';
    if (
      error instanceof Error &&
      error.name === 'MulterError' &&
      'code' in error &&
      error.code === 'LIMIT_FILE_SIZE'
    ) {
      statusCode = 413;
      code = ErrorCode.FILE_TOO_LARGE;
      message = 'File size limit exceeded';
    } else if (error instanceof HttpException) {
      statusCode = error.getStatus();
      const body = error.getResponse();
      const codes: Record<number, ErrorCode> = {
        400: ErrorCode.VALIDATION_ERROR,
        401: ErrorCode.UNAUTHENTICATED,
        403: ErrorCode.FORBIDDEN,
        404: ErrorCode.NOT_FOUND,
        409: ErrorCode.CONFLICT,
        429: ErrorCode.RATE_LIMITED,
      };
      code = codes[statusCode] ?? code;
      if (typeof body === 'string') message = body;
      else {
        const details = body as { code?: string; message?: string | string[] };
        code = details.code ?? code;
        message = details.message ?? error.message;
      }
    } else if (error instanceof Error && 'type' in error && error.type === 'entity.parse.failed') {
      statusCode = 400;
      code = ErrorCode.VALIDATION_ERROR;
      message = 'Invalid JSON request body';
    } else if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
      statusCode = 413;
      code = ErrorCode.VALIDATION_ERROR;
      message = 'Request body is too large';
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (['P2021', 'P2022'].includes(error.code)) {
        statusCode = 503;
        code = ErrorCode.DATABASE_UNAVAILABLE;
        message = 'Database schema is not ready';
      } else if (['P2002', 'P2003', 'P2034'].includes(error.code)) {
        statusCode = 409;
        code = ErrorCode.CONFLICT;
        message = 'The operation conflicts with existing data';
      } else if (error.code === 'P2025') {
        statusCode = 404;
        code = ErrorCode.NOT_FOUND;
        message = 'Resource not found';
      }
    }
    if (statusCode >= 500) {
      // Exception text, stack, headers, URL queries and request bodies may contain secrets.
      this.logger.error({
        code,
        requestId: response.getHeader('X-Request-ID'),
        ...(error instanceof Prisma.PrismaClientKnownRequestError
          ? { prismaCode: error.code }
          : {}),
      });
    }
    response.status(statusCode).json({
      statusCode,
      code,
      message,
      requestId: response.getHeader('X-Request-ID'),
    });
  }
}
