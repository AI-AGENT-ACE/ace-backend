import { ConversationsRepository } from './conversations.repository';
import { TrashCleanupScheduler } from './trash-cleanup.scheduler';

describe('trash startup and atomic purge', () => {
  it('does not schedule file deletion for a restored conversation', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      attachment: { findMany: jest.fn().mockResolvedValue([]) },
      fileDeletionJob: { createMany: jest.fn() },
      conversation: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const repo = new ConversationsRepository({
      $transaction: (callback: (value: typeof tx) => unknown) => callback(tx),
    } as never);
    await expect(repo.purge(['restored'], new Date())).resolves.toEqual({ count: 0 });
    expect(tx.attachment.findMany).toHaveBeenCalledWith({
      where: { conversationId: { in: [] } },
      select: { storagePath: true },
    });
    expect(tx.fileDeletionJob.createMany).toHaveBeenCalledWith({ data: [], skipDuplicates: true });
  });
  it('starts in background and drains bounded batches without retrying failed IDs in the same run', async () => {
    jest.useFakeTimers();
    const retention = {
      purgeExpired: jest
        .fn()
        .mockResolvedValueOnce({
          scanned: 100,
          deleted: 99,
          failed: 1,
          attemptedIds: ['failed', 'done'],
        })
        .mockResolvedValueOnce({ scanned: 0, deleted: 0, failed: 0, attemptedIds: [] }),
    };
    const scheduler = new TrashCleanupScheduler(
      retention as never,
      { get: (_: string, fallback: unknown) => fallback } as never,
    );
    scheduler.onApplicationBootstrap();
    expect(retention.purgeExpired).not.toHaveBeenCalled();
    await jest.runAllTimersAsync();
    expect(retention.purgeExpired).toHaveBeenCalledTimes(2);
    expect(retention.purgeExpired.mock.calls[1]).toEqual([100, ['failed', 'done']]);
    scheduler.onModuleDestroy();
    jest.useRealTimers();
  });
});
