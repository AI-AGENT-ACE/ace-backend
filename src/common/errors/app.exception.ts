import { HttpException } from '@nestjs/common';
import { ErrorCode } from './error-code';

export class AppException extends HttpException {
  constructor(statusCode: number, code: ErrorCode, message: string) {
    super({ statusCode, code, message }, statusCode);
  }
}
