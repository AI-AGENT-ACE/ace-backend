import { MessagesRepository } from './messages.repository';

describe('first-message conversation title', () => {
  function harness() {
    const transaction = {
      conversation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      message: {
        create: jest.fn().mockResolvedValue({ id: 'message' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'message' }),
      },
    };
    const prisma = {
      $transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    };
    return { repo: new MessagesRepository(prisma as never), transaction };
  }

  it('names only an owned default-titled conversation with no previous user message', async () => {
    const { repo, transaction } = harness();
    await repo.append('user', 'conversation', 'USER', '  서울 여행\n  계획을 알려줘  ');
    expect(transaction.conversation.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'conversation',
        userId: 'user',
        deletedAt: null,
        title: '새 대화',
        titleSource: 'DEFAULT',
        messages: { none: { role: 'USER' } },
      },
      data: { title: '서울 여행 계획을 알려줘', titleSource: 'TEMPORARY' },
    });
    expect(transaction.conversation.updateMany.mock.invocationCallOrder[1]).toBeLessThan(
      transaction.message.create.mock.invocationCallOrder[0]!,
    );
  });

  it('limits the title without splitting emoji', async () => {
    const { repo, transaction } = harness();
    await repo.append('user', 'conversation', 'USER', '😀'.repeat(220));
    expect(transaction.conversation.updateMany.mock.calls[1][0].data.title).toBe(
      '😀'.repeat(199) + '…',
    );
  });

  it.each(['ASSISTANT', 'TOOL', 'SYSTEM'] as const)(
    'does not name conversations from %s messages',
    async (role) => {
      const { repo, transaction } = harness();
      await repo.append('user', 'conversation', role, '자동 응답');
      expect(transaction.conversation.updateMany).toHaveBeenCalledTimes(1);
    },
  );

  it('leaves an attachment-only message title unchanged', async () => {
    const { repo, transaction } = harness();
    await repo.append('user', 'conversation', 'USER', '   ');
    expect(transaction.conversation.updateMany).toHaveBeenCalledTimes(1);
  });

  it('does not create a message or title when the parent is not writable', async () => {
    const { repo, transaction } = harness();
    transaction.conversation.updateMany.mockResolvedValue({ count: 0 });
    await expect(repo.append('other-user', 'conversation', 'USER', '내용')).rejects.toMatchObject({
      response: { code: 'CONVERSATION_NOT_FOUND' },
    });
    expect(transaction.message.create).not.toHaveBeenCalled();
    expect(transaction.conversation.updateMany).toHaveBeenCalledTimes(1);
  });
});
