import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { AuthRepository } from '../auth.repository';
import { PUBLIC_ROUTE } from '../decorators/public.decorator';
import { TokenService } from '../services/token.service';
import { AuthenticatedUser } from '../types/authenticated-user';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: AuthRepository,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<Request & { auth?: AuthenticatedUser }>();
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
    if (!match?.[1] || match[1].length > 4096)
      throw new AppException(401, ErrorCode.UNAUTHENTICATED, 'Authentication required');
    let claims;
    try {
      claims = await this.tokens.verify(match[1], 'access');
    } catch {
      throw new AppException(401, ErrorCode.UNAUTHENTICATED, 'Access token is invalid or expired');
    }
    const session = await this.sessions.findActiveSession(claims.sid, claims.sub);
    if (!session)
      throw new AppException(401, ErrorCode.UNAUTHENTICATED, 'Session is no longer active');
    request.auth = { userId: claims.sub, sessionId: claims.sid };
    return true;
  }
}
