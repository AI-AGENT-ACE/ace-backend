import { ToolExecutionStatus } from '../generated/prisma/client';
import { ToolCatalog } from '../tools/catalog/tool-catalog.service';
import { ToolName } from '../tools/catalog/tool-name';
import { LogsRepository } from './logs.repository';
import { LogsService } from './logs.service';
import { ToolLogErrorCode } from './tool-log.types';

describe('LogsService privacy', () => {
  it('does not pass arguments, output, tokens, headers or raw file contents into persistence', async () => {
    const repo = { create: jest.fn() };
    const service = new LogsService(repo as unknown as LogsRepository, new ToolCatalog());
    const unsafe = {
      userId: 'user-a',
      toolName: ToolName.FILE_OPEN,
      status: ToolExecutionStatus.FAILED,
      duration: 12.7,
      errorCode: ToolLogErrorCode.LOCAL_EXECUTION_FAILED,
      arguments: { path: 'private-file', password: 'secret' },
      result: 'file contents',
      accessToken: 'secret',
      refreshToken: 'secret',
      authorization: 'Bearer secret',
      voice: 'private audio',
      deviceId: 'must-not-exist',
    };
    await service.record(unsafe);
    expect(repo.create).toHaveBeenCalledWith({
      userId: 'user-a',
      toolName: ToolName.FILE_OPEN,
      status: ToolExecutionStatus.FAILED,
      duration: 13,
      errorCode: ToolLogErrorCode.LOCAL_EXECUTION_FAILED,
    });
  });
});
