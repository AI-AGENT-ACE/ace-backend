import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { UsersRepository } from '../users/users.repository';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { PasswordHasher } from './services/password-hasher.service';
import { TokenService } from './services/token.service';
import { AuthRepository } from './auth.repository';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: AuthRepository,
    private readonly passwords: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async register(input: RegisterDto) {
    const passwordHash = await this.passwords.hash(input.password);
    try {
      const user = await this.users.create(input.email, passwordHash, input.displayName);
      return { user, ...(await this.newSession(user.id)) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          409,
          ErrorCode.EMAIL_ALREADY_REGISTERED,
          'Email is already registered',
        );
      }
      throw error;
    }
  }

  async login(input: LoginDto) {
    const credentials = await this.users.findCredentials(input.email);
    const valid = await this.passwords.verify(input.password, credentials?.passwordHash);
    if (!credentials || !valid)
      throw new AppException(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
    const user = await this.users.findProfile(credentials.id);
    return { user, ...(await this.newSession(credentials.id)) };
  }

  private async newSession(userId: string) {
    const sessionId = randomUUID();
    const pair = await this.tokens.issue(userId, sessionId);
    await this.sessions.createSession(
      sessionId,
      userId,
      this.tokens.digest(pair.refreshToken),
      pair.refreshExpiresAt,
    );
    return pair;
  }

  async refresh(refreshToken: string) {
    let claims;
    try {
      claims = await this.tokens.verify(refreshToken, 'refresh');
    } catch {
      throw new AppException(
        401,
        ErrorCode.INVALID_REFRESH_TOKEN,
        'Refresh token is invalid or expired',
      );
    }
    const pair = await this.tokens.issue(claims.sub, claims.sid);
    const changed = await this.sessions.rotate(
      claims.sid,
      claims.sub,
      this.tokens.digest(refreshToken),
      this.tokens.digest(pair.refreshToken),
      pair.refreshExpiresAt,
    );
    if (changed.count !== 1) {
      // A reused refresh token revokes the session, including already-issued access tokens.
      await this.sessions.revoke(claims.sid, claims.sub);
      throw new AppException(
        401,
        ErrorCode.INVALID_REFRESH_TOKEN,
        'Refresh token is invalid or expired',
      );
    }
    return pair;
  }

  async logout(userId: string, sessionId: string) {
    await this.sessions.revoke(sessionId, userId);
  }
}
