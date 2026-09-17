import { Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { cursorPage, PageQueryDto } from '../common/pagination/page.dto';
import { CreateVoiceLogDto } from './dto/voice-log.dto';
import { VoiceLogsRepository } from './voice-logs.repository';

@Injectable()
export class VoiceLogsService {
  constructor(private readonly logs: VoiceLogsRepository) {}
  create(userId: string, input: CreateVoiceLogDto) {
    return this.logs.create(userId, input);
  }
  async list(userId: string, query: PageQueryDto) {
    if (query.cursor && !(await this.logs.cursor(userId, query.cursor)))
      throw new AppException(400, ErrorCode.INVALID_CURSOR, 'Invalid voice log cursor');
    return cursorPage(await this.logs.list(userId, query.limit, query.cursor), query.limit);
  }
}
