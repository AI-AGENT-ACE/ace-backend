import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VoiceAiClient } from './voice-ai.client';
import { validateVoiceWav, VoiceUpload } from './voice-audio.policy';
import { VoiceTempService } from './voice-temp.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';

@Injectable()
export class VoiceCommandsService {
  constructor(
    private readonly config: ConfigService,
    private readonly temp: VoiceTempService,
    private readonly ai: VoiceAiClient,
  ) {}
  async process(
    userId: string,
    recordingId: string,
    conversationId: string | undefined,
    input?: VoiceUpload,
  ) {
    if (!/^voice_[a-f0-9-]{16,80}$/i.test(recordingId))
      throw new AppException(400, ErrorCode.VOICE_FILE_INVALID, 'Invalid recordingId');
    if (conversationId && !/^[a-zA-Z0-9_-]{1,128}$/.test(conversationId))
      throw new AppException(400, ErrorCode.VOICE_FILE_INVALID, 'Invalid conversationId');
    const file = validateVoiceWav(input, this.config.getOrThrow<number>('VOICE_MAX_FILE_SIZE'));
    const path = await this.temp.create(file.buffer);
    try {
      return await this.ai.process(path, recordingId, userId, conversationId);
    } finally {
      await this.temp.remove(path);
    }
  }
}
