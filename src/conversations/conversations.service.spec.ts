import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';

describe('ConversationsService', () => {
  let repo: Record<string, jest.Mock>;
  let service: ConversationsService;
  const record = {
    id: 'conv-a',
    userId: 'user-a',
    title: 'ACE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    isPinned: false,
  };
  beforeEach(() => {
    repo = Object.fromEntries(
      [
        'create',
        'findOwned',
        'findActive',
        'findCursor',
        'list',
        'update',
        'softDelete',
        'restore',
        'permanentDelete',
      ].map((name) => [name, jest.fn()]),
    );
    service = new ConversationsService(repo as unknown as ConversationsRepository);
  });
  it('creates the conversation under the authenticated account', async () => {
    repo.create!.mockResolvedValue(record);
    expect(await service.create('user-a', 'ACE')).toEqual(record);
    expect(repo.create).toHaveBeenCalledWith('user-a', 'ACE');
  });
  it('does not expose another account conversation', async () => {
    repo.findActive!.mockResolvedValue(null);
    await expect(service.active('user-b', 'conv-a')).rejects.toBeInstanceOf(AppException);
    expect(repo.findActive).toHaveBeenCalledWith('user-b', 'conv-a');
  });
  it('soft-deletes with the owner scope', async () => {
    repo.softDelete!.mockResolvedValue({ count: 1 });
    await service.softDelete('user-a', 'conv-a');
    expect(repo.softDelete).toHaveBeenCalledWith('user-a', 'conv-a');
  });
  it('rejects deleting another account resource', async () => {
    repo.softDelete!.mockResolvedValue({ count: 0 });
    await expect(service.softDelete('user-b', 'conv-a')).rejects.toMatchObject({ status: 404 });
  });
  it('uses the trash list and returns recovery information', async () => {
    repo.list!.mockResolvedValue([{ ...record, deletedAt: new Date() }]);
    const page = await service.list('user-a', { limit: 20 }, true);
    expect(repo.list).toHaveBeenCalledWith('user-a', 20, undefined, true);
    expect(page.items[0]).toMatchObject({ isRestorable: true, remainingDays: 30 });
  });
  it('restores a conversation during its recovery period', async () => {
    repo.findOwned!.mockResolvedValue({ ...record, deletedAt: new Date() });
    repo.restore!.mockResolvedValue({ count: 1 });
    repo.findActive!.mockResolvedValue(record);
    expect(await service.restore('user-a', 'conv-a')).toEqual(record);
    expect(repo.restore).toHaveBeenCalledWith('user-a', 'conv-a', expect.any(Date));
  });
  it('blocks restoration after 30 days', async () => {
    repo.findOwned!.mockResolvedValue({
      ...record,
      deletedAt: new Date(Date.now() - 31 * 86400000),
    });
    await expect(service.restore('user-a', 'conv-a')).rejects.toMatchObject({
      response: { code: ErrorCode.CONVERSATION_EXPIRED },
    });
    expect(repo.restore).not.toHaveBeenCalled();
  });
  it('permanently deletes only an owned trash conversation', async () => {
    repo.findOwned!.mockResolvedValue({ ...record, deletedAt: new Date() });
    repo.permanentDelete!.mockResolvedValue({ count: 1 });
    await service.permanentDelete('user-a', 'conv-a');
    expect(repo.permanentDelete).toHaveBeenCalledWith('user-a', 'conv-a');
  });
  it('requires an active conversation to be moved to trash before permanent deletion', async () => {
    repo.findOwned!.mockResolvedValue(record);
    await expect(service.permanentDelete('user-a', 'conv-a')).rejects.toMatchObject({
      status: 409,
    });
    expect(repo.permanentDelete).not.toHaveBeenCalled();
  });
  it('rejects another account cursor', async () => {
    repo.findCursor!.mockResolvedValue(null);
    await expect(
      service.list('user-a', { limit: 20, cursor: 'foreign-cursor' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.list).not.toHaveBeenCalled();
  });
});
