import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

const claimsSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  jti: z.string().min(1),
  type: z.enum(['access', 'refresh']),
});

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issue(userId: string, sessionId: string) {
    const expiresIn = this.config.getOrThrow<number>('JWT_ACCESS_EXPIRES_IN');
    const refreshLifetime = this.config.getOrThrow<number>('JWT_REFRESH_EXPIRES_IN');
    const options = { algorithm: 'HS256' as const, issuer: 'ace-backend', audience: 'ace-desktop' };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: userId, sid: sessionId, type: 'access', jti: randomUUID() },
        {
          ...options,
          secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
          expiresIn,
        },
      ),
      this.jwt.signAsync(
        { sub: userId, sid: sessionId, type: 'refresh', jti: randomUUID() },
        {
          ...options,
          secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
          expiresIn: refreshLifetime,
        },
      ),
    ]);
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer' as const,
      expiresIn,
      refreshExpiresAt: new Date(Date.now() + refreshLifetime * 1000),
    };
  }

  async verify(token: string, type: 'access' | 'refresh') {
    const payload: unknown = await this.jwt.verifyAsync(token, {
      secret: this.config.getOrThrow(
        type === 'access' ? 'JWT_ACCESS_SECRET' : 'JWT_REFRESH_SECRET',
      ),
      algorithms: ['HS256'],
      issuer: 'ace-backend',
      audience: 'ace-desktop',
    });
    const claims = claimsSchema.parse(payload);
    if (claims.type !== type) throw new Error('Invalid token purpose');
    return claims;
  }

  digest(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
