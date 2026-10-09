import { Body, Controller, Post, StreamableFile, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { JsonHttpClient } from '../common/http/json-http.client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';

export class SpeechDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  text!: string;
}

@ApiTags('Voice Commands')
@ApiBearerAuth()
@Controller('voice')
export class SpeechController {
  constructor(
    private readonly config: ConfigService,
    private readonly http: JsonHttpClient,
  ) {}

  @Post('tts')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiProduces('audio/wav')
  @Header('Cache-Control', 'no-store')
  async speak(@Body() input: SpeechDto) {
    const base = this.config.get<string>('AI_SERVER_URL');
    if (!base)
      throw new AppException(503, ErrorCode.AI_NOT_CONFIGURED, 'AI server is not configured');
    const key = this.config.get<string>('AI_SERVER_API_KEY');
    try {
      const bytes = await this.http.wav(
        `${base.replace(/\/$/, '')}/tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
          },
          body: JSON.stringify({ text: input.text }),
        },
        this.config.getOrThrow<number>('AI_REQUEST_TIMEOUT_MS'),
      );
      return new StreamableFile(bytes, { type: 'audio/wav', length: bytes.length });
    } catch {
      throw new AppException(502, ErrorCode.AI_UNAVAILABLE, 'AI speech synthesis is unavailable');
    }
  }
}
