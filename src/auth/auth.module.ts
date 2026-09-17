import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { AccessTokenGuard } from './guards/access-token.guard';
import { PasswordHasher } from './services/password-hasher.service';
import { TokenService } from './services/token.service';

@Global()
@Module({
  imports: [UsersModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    PasswordHasher,
    TokenService,
    { provide: APP_GUARD, useClass: AccessTokenGuard },
  ],
  exports: [TokenService],
})
export class AuthModule {}
