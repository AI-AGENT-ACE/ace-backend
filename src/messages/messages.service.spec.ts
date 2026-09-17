import { ConversationsService } from '../conversations/conversations.service';
import { MessagesRepository } from './messages.repository';
import { MessagesService } from './messages.service';

describe('MessagesService', () => {
  let conversations: { active: jest.Mock };
  let repo: { list: jest.Mock; findCursor: jest.Mock; append: jest.Mock };
  let service: MessagesService;
  beforeEach(() => {
    conversations = { active: jest.fn().mockResolvedValue({ id: 'conversation-a' }) };
    repo = { list: jest.fn(), findCursor: jest.fn(), append: jest.fn() };
    service = new MessagesService(
      conversations as unknown as ConversationsService,
      repo as unknown as MessagesRepository,
    );
  });
  it('returns 30 recent messages and a next cursor, without retrieving an unbounded history', async () => {
    repo.list.mockResolvedValue(
      Array.from({ length: 31 }, (_, index) => ({ id: `message-${index}` })),
    );
    const page = await service.list('user-a', 'conversation-a', { limit: 30 });
    expect(page.items).toHaveLength(30);
    expect(page.nextCursor).toBe('message-29');
    expect(page.hasMore).toBe(true);
    expect(repo.list).toHaveBeenCalledWith('user-a', 'conversation-a', 30, undefined);
  });
  it('loads older messages after a conversation-scoped cursor', async () => {
    repo.findCursor.mockResolvedValue({ id: 'cursor-a' });
    repo.list.mockResolvedValue([{ id: 'last-message' }]);
    const page = await service.list('user-a', 'conversation-a', { limit: 30, cursor: 'cursor-a' });
    expect(repo.findCursor).toHaveBeenCalledWith('user-a', 'conversation-a', 'cursor-a');
    expect(page.nextCursor).toBeNull();
    expect(page.hasMore).toBe(false);
  });
  it('rejects a cursor from a different conversation', async () => {
    repo.findCursor.mockResolvedValue(null);
    await expect(
      service.list('user-a', 'conversation-a', { limit: 30, cursor: 'foreign-message' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.list).not.toHaveBeenCalled();
  });
  it('does not query messages when ownership validation fails', async () => {
    conversations.active.mockRejectedValue(new Error('not found'));
    await expect(service.list('user-b', 'conversation-a', { limit: 30 })).rejects.toThrow();
    expect(repo.list).not.toHaveBeenCalled();
  });
});
