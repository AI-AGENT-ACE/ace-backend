import { ConfigService } from '@nestjs/config';
import { AttachmentCleanupService } from '../attachments/attachments.service';
import { ConversationsRepository } from './conversations.repository';
import { TrashRetentionService } from './trash-retention.service';

describe('TrashRetentionService', () => {
  const conversations = { expiredIds: jest.fn(), purge: jest.fn() };
  const attachments = { removeForConversations: jest.fn() };
  const config = { get: jest.fn().mockReturnValue(30) };
  const service = new TrashRetentionService(
    conversations as unknown as ConversationsRepository,
    attachments as unknown as AttachmentCleanupService,
    config as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue(30);
  });

  it('uses a bounded batch and continues after an individual cleanup failure', async () => {
    conversations.expiredIds.mockResolvedValue([{ id: 'failed' }, { id: 'deleted' }]);
    attachments.removeForConversations
      .mockRejectedValueOnce(new Error('disk error'))
      .mockResolvedValueOnce(undefined);
    conversations.purge.mockResolvedValue({ count: 1 });
    await expect(service.purgeExpired(100)).resolves.toEqual({ scanned: 2, deleted: 1, failed: 1 });
    expect(conversations.purge).toHaveBeenCalledTimes(1);
    expect(conversations.expiredIds).toHaveBeenCalledWith(expect.any(Date), 100);
  });

  it('keeps non-expired and restored rows outside the repository result', async () => {
    conversations.expiredIds.mockResolvedValue([]);
    await expect(service.purgeExpired(250)).resolves.toEqual({ scanned: 0, deleted: 0, failed: 0 });
    expect(attachments.removeForConversations).not.toHaveBeenCalled();
  });
});
