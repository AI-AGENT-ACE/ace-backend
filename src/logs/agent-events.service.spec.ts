import { Logger } from '@nestjs/common';
import { AgentEventKind, AgentEventsService } from './agent-events.service';

describe('Agent event privacy', () => {
  afterEach(() => jest.restoreAllMocks());
  it('records a failure without leaking sensitive exception text', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const sensitive = new Error('Authorization: Bearer private-token; file content: private-data');
    await expect(
      new AgentEventsService().track(AgentEventKind.TURN, async () => {
        throw sensitive;
      }),
    ).rejects.toBe(sensitive);
    expect(warn).toHaveBeenCalledWith({
      event: 'AGENT_TURN',
      status: 'FAILED',
      duration: expect.any(Number),
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private-token');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private-data');
  });
});
