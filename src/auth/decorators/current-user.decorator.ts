import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { AuthenticatedUser } from '../types/authenticated-user';

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request & { auth?: AuthenticatedUser }>();
    if (!request.auth)
      throw new AppException(401, ErrorCode.UNAUTHENTICATED, 'Authentication required');
    return request.auth;
  },
);
