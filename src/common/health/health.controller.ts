import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code';
import { JsonHttpClient } from '../http/json-http.client';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly http: JsonHttpClient,
  ) {}
  @Get('live') live() {
    return { status: 'ok', service: 'ace-backend', uptime: Math.floor(process.uptime()) };
  }

  @Get(['', 'ready']) async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      // A reachable empty database cannot serve registration or authentication.
      await this.prisma.user.findFirst({ select: { id: true } });
      await this.prisma.authSession.findFirst({ select: { id: true } });
    } catch {
      throw new AppException(503, ErrorCode.DATABASE_UNAVAILABLE, 'Database is unavailable');
    }
    const ai = await this.aiStatus();
    return {
      status: ai === 'unavailable' ? 'degraded' : 'ok',
      service: 'ace-backend',
      timestamp: new Date().toISOString(),
      database: 'connected',
      ai,
      redis: 'not_configured',
      weather: this.config.get('WEATHER_API_KEY') ? 'configured' : 'not_configured',
    };
  }

  private async aiStatus() {
    const base = this.config.get<string>('AI_SERVER_URL');
    if (!base) return 'not_configured' as const;
    try {
      await this.http.request(
        `${base.replace(/\/$/, '')}/health`,
        {
          headers: this.config.get<string>('AI_SERVER_API_KEY')
            ? { Authorization: `Bearer ${this.config.get<string>('AI_SERVER_API_KEY')}` }
            : undefined,
        },
        2_000,
      );
      return 'connected' as const;
    } catch {
      return 'unavailable' as const;
    }
  }
}
