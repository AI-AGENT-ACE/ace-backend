import { ConfigService } from '@nestjs/config';
import { TrashCleanupScheduler } from './trash-cleanup.scheduler';
import { TrashRetentionService } from './trash-retention.service';

describe('TrashCleanupScheduler', () => {
  const config = {
    get: jest.fn((name: string, fallback: unknown) =>
      name === 'TRASH_CLEANUP_BATCH_SIZE' ? 250 : fallback,
    ),
  };

  it('records counts and timing for a cleanup run', async () => {
    const retention = { purgeExpired: jest.fn().mockResolvedValue({ deleted: 3, failed: 1 }) };
    const scheduler = new TrashCleanupScheduler(
      retention as unknown as TrashRetentionService,
      config as unknown as ConfigService,
    );
    await expect(scheduler.runOnce()).resolves.toMatchObject({
      skipped: false,
      deletedCount: 3,
      failedCount: 1,
      startedAt: expect.any(String),
      finishedAt: expect.any(String),
      duration: expect.any(Number),
    });
    expect(retention.purgeExpired).toHaveBeenCalledWith(250);
  });

  it('skips an overlapping run in the same instance', async () => {
    let resolve!: (value: { deleted: number; failed: number }) => void;
    const pending = new Promise<{ deleted: number; failed: number }>((done) => (resolve = done));
    const retention = { purgeExpired: jest.fn().mockReturnValue(pending) };
    const scheduler = new TrashCleanupScheduler(
      retention as unknown as TrashRetentionService,
      config as unknown as ConfigService,
    );
    const first = scheduler.runOnce();
    await expect(scheduler.runOnce()).resolves.toMatchObject({ skipped: true });
    resolve({ deleted: 0, failed: 0 });
    await first;
  });
});
