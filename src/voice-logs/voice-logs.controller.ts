import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { PageQueryDto } from '../common/pagination/page.dto';
import { CreateVoiceLogDto } from './dto/voice-log.dto';
import { VoiceLogsService } from './voice-logs.service';

@ApiTags('Voice logs')
@ApiBearerAuth()
@Controller('logs/voice')
export class VoiceLogsController {
  constructor(private readonly logs: VoiceLogsService) {}
  @Post()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  create(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateVoiceLogDto) {
    return this.logs.create(user.userId, input);
  }
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: PageQueryDto) {
    return this.logs.list(user.userId, query);
  }
}
