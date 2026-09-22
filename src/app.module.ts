import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AgentModule } from './agent/agent.module';
import { AuthModule } from './auth/auth.module';
import { validateEnvironment } from './common/config/environment';
import { HealthController } from './common/health/health.controller';
import { PrismaModule } from './common/prisma/prisma.module';
import { ConversationsModule } from './conversations/conversations.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { LogsModule } from './logs/logs.module';
import { MessagesModule } from './messages/messages.module';
import { SettingsModule } from './settings/settings.module';
import { ToolsModule } from './tools/tools.module';
import { UsersModule } from './users/users.module';
import { WeatherModule } from './weather/weather.module';
import { VoiceLogsModule } from './voice-logs/voice-logs.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { ConfigService } from '@nestjs/config';
import { rateLimitKey, rateLimitTracker } from './common/rate-limit/rate-limit-key';
import { HttpModule } from './common/http/http.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PrismaModule,
    HttpModule,
    AuthModule,
    UsersModule,
    ConversationsModule,
    MessagesModule,
    SettingsModule,
    WeatherModule,
    IntegrationsModule,
    ToolsModule,
    LogsModule,
    VoiceLogsModule,
    AgentModule,
    AttachmentsModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.getOrThrow<number>('RATE_LIMIT_TTL'),
            limit: config.getOrThrow<number>('RATE_LIMIT_MAX'),
          },
        ],
        getTracker: (request) => rateLimitTracker(request),
        generateKey: rateLimitKey,
      }),
    }),
  ],
  controllers: [HealthController],
  providers: [ThrottlerGuard, { provide: APP_GUARD, useExisting: ThrottlerGuard }],
})
export class AppModule {}
