import { Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { cursorPage, PageQueryDto } from '../common/pagination/page.dto';
import { ToolCatalog } from '../tools/catalog/tool-catalog.service';
import { ToolExecutionStatus } from '../generated/prisma/client';
import { LogsRepository } from './logs.repository';
import { ToolLogEntry, ToolLogErrorCode } from './tool-log.types';

@Injectable()
export class LogsService {
  constructor(
    private readonly logs: LogsRepository,
    private readonly tools: ToolCatalog,
  ) {}
  record(entry: ToolLogEntry) {
    const definition = this.tools.get(entry.toolName);
    if (!Object.values(ToolExecutionStatus).includes(entry.status))
      throw new TypeError('Invalid tool status');
    // An explicit allowlist prevents arbitrary extra properties, raw results or arguments reaching Prisma.
    return this.logs.create({
      userId: entry.userId,
      toolName: definition.name,
      status: entry.status,
      errorCode:
        entry.errorCode && Object.values(ToolLogErrorCode).includes(entry.errorCode)
          ? entry.errorCode
          : undefined,
      duration:
        entry.duration === undefined
          ? undefined
          : Math.max(0, Math.min(86400000, Math.round(entry.duration))),
    });
  }
  async list(userId: string, query: PageQueryDto) {
    if (query.cursor && !(await this.logs.cursor(userId, query.cursor)))
      throw new AppException(400, ErrorCode.INVALID_CURSOR, 'Invalid log cursor');
    return cursorPage(await this.logs.list(userId, query.limit, query.cursor), query.limit);
  }
}
