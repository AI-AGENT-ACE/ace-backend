import { Module } from '@nestjs/common';
import { VoiceLogsController } from './voice-logs.controller';
import { VoiceLogsRepository } from './voice-logs.repository';
import { VoiceLogsService } from './voice-logs.service';
@Module({ controllers: [VoiceLogsController], providers: [VoiceLogsRepository, VoiceLogsService] })
export class VoiceLogsModule {}
