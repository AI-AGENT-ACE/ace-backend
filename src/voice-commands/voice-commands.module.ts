import { Module } from '@nestjs/common';
import { SpeechController } from './speech.controller';
import { AiConversationsService } from '../agent/adapters/ai-conversations.service';
import { HttpModule } from '../common/http/http.module';
import { VoiceAiClient } from './voice-ai.client';
import { VoiceCommandsController } from './voice-commands.controller';
import { VoiceCommandsService } from './voice-commands.service';
import { VoiceTempService } from './voice-temp.service';

@Module({
  imports: [HttpModule],
  controllers: [VoiceCommandsController, SpeechController],
  providers: [VoiceCommandsService, VoiceTempService, VoiceAiClient, AiConversationsService],
})
export class VoiceCommandsModule {}
