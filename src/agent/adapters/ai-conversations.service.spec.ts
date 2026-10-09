import { AiConversationsService } from './ai-conversations.service';

describe('AI conversation ownership and persistence', () => {
  it('checks ownership before using a stored remote ID', async () => {
    const prisma = {
      conversation: { findFirst: jest.fn().mockResolvedValue(null) },
      aiConversation: { findUnique: jest.fn() },
    };
    const http = { request: jest.fn() };
    await expect(
      new AiConversationsService(prisma as never, http as never).resolve(
        'attacker',
        'other',
        'https://ai.example',
        {},
        120000,
      ),
    ).rejects.toMatchObject({ response: { code: 'CONVERSATION_NOT_FOUND' } });
    expect(http.request).not.toHaveBeenCalled();
    expect(prisma.aiConversation.findUnique).not.toHaveBeenCalled();
  });
  it('reuses persisted IDs after adapter restart without creating a new remote conversation', async () => {
    const prisma = {
      conversation: { findFirst: jest.fn().mockResolvedValue({ id: 'owned' }) },
      aiConversation: { findUnique: jest.fn().mockResolvedValue({ remoteId: 'persisted' }) },
    };
    const http = { request: jest.fn() };
    expect(
      await new AiConversationsService(prisma as never, http as never).resolve(
        'user',
        'owned',
        'https://ai.example',
        {},
        120000,
      ),
    ).toBe('persisted');
    expect(http.request).not.toHaveBeenCalled();
  });
});
