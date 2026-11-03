import { AttachmentCleanupService } from './attachments.service';
describe('durable file deletion', () => {
  it('keeps failed jobs with bounded backoff and deletes successful jobs', async () => {
    const storage = {
      delete: jest
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(undefined),
    };
    const jobs = {
      findMany: jest.fn().mockResolvedValue([
        { id: 'retry', storagePath: 'private/a', attempts: 2 },
        { id: 'done', storagePath: 'private/b', attempts: 0 },
      ]),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    };
    const service = new AttachmentCleanupService(
      storage as never,
      { fileDeletionJob: jobs } as never,
    );
    await service.retryDeletions();
    expect(jobs.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'retry', attempts: 2 } }),
    );
    expect(jobs.deleteMany).toHaveBeenCalledWith({ where: { id: 'done' } });
    expect(jobs.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { nextAttemptAt: { lte: expect.any(Date) }, attempts: { lt: 10 } },
        take: 100,
      }),
    );
  });
});
