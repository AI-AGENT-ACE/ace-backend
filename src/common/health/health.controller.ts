import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-code';

@ApiTags('Health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  @Get() async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      // A reachable empty database cannot serve registration or authentication.
      await this.prisma.user.findFirst({ select: { id: true } });
      await this.prisma.authSession.findFirst({ select: { id: true } });
    } catch {
      throw new AppException(503, ErrorCode.DATABASE_UNAVAILABLE, 'Database is unavailable');
    }
    return {
      status: 'ok',
      database: 'connected',
      ai: this.config.get('AI_SERVER_URL') ? 'configured' : 'not_configured',
      weather: this.config.get('WEATHER_API_KEY') ? 'configured' : 'not_configured',
    };
  }
}
