import { ToolTicketService } from './tool-ticket.service';
import { ToolName } from '../../tools/catalog/tool-name';

function setup() {
  const events: Record<string, unknown>[] = [];
  let state = 'REQUESTED';
  const claims = {
    type: 'tool-handoff',
    sub: 'owner',
    conversationId: '',
    callId: 'execution',
    toolName: ToolName.APP_OPEN,
    argumentsDigest: 'a'.repeat(64),
  };
  const tx = {
    $queryRaw: jest.fn(async () => [{ state }]),
    nativeExecutionEvent: {
      findUnique: jest.fn(async ({ where }) =>
        events.find((e) =>
          Object.entries(where.executionId_attemptId_state).every(([k, v]) => e[k] === v),
        ),
      ),
      findFirst: jest.fn(async ({ where }) =>
        events.find((e) => Object.entries(where).every(([k, v]) => e[k] === v)),
      ),
      findMany: jest.fn(async ({ where }) =>
        events.filter((e) => Object.entries(where).every(([k, v]) => e[k] === v)),
      ),
      create: jest.fn(async ({ data }) => {
        events.push(data);
        return data;
      }),
    },
    nativeExecution: {
      update: jest.fn(async ({ data }) => {
        state = data.state;
      }),
    },
  };
  const prisma = {
    $transaction: (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx),
    nativeExecution: { findFirst: jest.fn(async () => null) },
  };
  const service = new ToolTicketService(
    { verifyAsync: async () => claims } as unknown as ConstructorParameters<
      typeof ToolTicketService
    >[0],
    { getOrThrow: () => 'test-only' } as unknown as ConstructorParameters<
      typeof ToolTicketService
    >[1],
    prisma as unknown as ConstructorParameters<typeof ToolTicketService>[2],
  );
  return { service, events };
}
describe('Native execution trace', () => {
  it('rejects another owner and unknown execution history', async () => {
    const { service } = setup();
    await expect(service.event('other', 'ticket', 'attempt', 'REQUESTED')).rejects.toThrow();
    await expect(service.history('other', 'execution')).rejects.toThrow();
  });
  it('requires approval before running an approval-waiting attempt and keeps terminal results immutable', async () => {
    const { service, events } = setup();
    const event = (state: string) => service.event('owner', 'ticket', 'attempt', state);
    await expect(event('SUCCEEDED')).rejects.toThrow();
    await event('REQUESTED');
    await event('WAITING_APPROVAL');
    await expect(event('RUNNING')).rejects.toThrow();
    await event('APPROVED');
    await event('RUNNING');
    await event('SUCCEEDED');
    await event('SUCCEEDED');
    expect(events).toHaveLength(5);
    await expect(event('FAILED')).rejects.toThrow();
    expect(
      events.every((e) =>
        Object.keys(e).every((k) =>
          ['executionId', 'attemptId', 'previousAttemptId', 'state'].includes(k),
        ),
      ),
    ).toBe(true);
  });
  it('requires a valid previous attempt when retrying', async () => {
    const { service, events } = setup();
    await service.event('owner', 'ticket', 'first', 'REQUESTED');
    await service.event('owner', 'ticket', 'first', 'FAILED');
    await expect(service.event('owner', 'ticket', 'second', 'REQUESTED')).rejects.toThrow();
    await expect(
      service.event('owner', 'ticket', 'second', 'REQUESTED', 'unknown'),
    ).rejects.toThrow();
    await service.event('owner', 'ticket', 'second', 'REQUESTED', 'first');
    expect(events.at(-1)).toMatchObject({
      executionId: 'execution',
      attemptId: 'second',
      previousAttemptId: 'first',
    });
  });
});
