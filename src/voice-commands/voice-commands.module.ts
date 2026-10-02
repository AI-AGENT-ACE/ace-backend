import { Module } from '@nestjs/common';
import { HttpModule } from '../common/http/http.module';
import { VoiceAiClient } from './voice-ai.client';
import { VoiceCommandsController } from './voice-commands.controller';
import { VoiceCommandsService } from './voice-commands.service';
import { VoiceTempService } from './voice-temp.service';

@Module({
  imports: [HttpModule],
  controllers: [VoiceCommandsController],
  providers: [VoiceCommandsService, VoiceTempService, VoiceAiClient],
})
export class VoiceCommandsModule {}
