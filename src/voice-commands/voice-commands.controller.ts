import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { VoiceUpload } from './voice-audio.policy';
import { VoiceCommandsService } from './voice-commands.service';

@ApiTags('Voice Commands')
@ApiBearerAuth()
@Controller('voice/commands')
export class VoiceCommandsController {
  constructor(private readonly service: VoiceCommandsService) {}
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('audio', { limits: { fileSize: 33554432, files: 1, fields: 2 } }),
  )
  process(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { recordingId?: string; conversationId?: string },
    @UploadedFile() file?: VoiceUpload,
  ) {
    return this.service.process(user.userId, body.recordingId ?? '', body.conversationId, file);
  }
}
