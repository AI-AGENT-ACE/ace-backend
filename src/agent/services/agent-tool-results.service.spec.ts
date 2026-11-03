import { AgentToolResultsService } from './agent-tool-results.service';
import { ToolCatalog } from '../../tools/catalog/tool-catalog.service';
import { ToolName } from '../../tools/catalog/tool-name';
import { ToolExecutionStatus } from '../../generated/prisma/client';
describe('실행 결과 수신의 검증과 중복 방지', () => {
  function harness() {
    const claims = {
      callId: '00000000-0000-4000-8000-000000000001',
      conversationId: 'owned',
      toolName: ToolName.FILE_COPY,
    };
    const tickets = { verify: jest.fn().mockResolvedValue(claims) };
    const logs = { record: jest.fn() };
    const ai = { generate: jest.fn().mockResolvedValue({ toolCalls: [] }) };
    const messages = { append: jest.fn() };
    const permissions = {
      effective: jest.fn().mockResolvedValue({ denied: false, requiresConfirmation: true }),
    };
    const responses = { deliver: jest.fn() };
    const service = new AgentToolResultsService(
      tickets as never,
      new ToolCatalog(),
      { active: jest.fn() } as never,
      permissions as never,
      {} as never,
      logs as never,
      messages as never,
      ai as never,
      {
        build: jest
          .fn()
          .mockImplementation((_user, _conversation, toolResults) => ({ toolResults })),
      } as never,
      responses as never,
      { track: (_: unknown, fn: () => unknown) => fn() } as never,
    );
    return { service, claims, tickets, logs, ai, messages, permissions, responses };
  }
  const input = { ticket: 'signed', status: ToolExecutionStatus.SUCCEEDED, confirmed: true };
  it('미승인 실패 결과는 기록하되 미승인 성공 결과는 거부', async () => {
    const h = harness();
    await h.service.local('owner', {
      ...input,
      status: ToolExecutionStatus.FAILED,
      confirmed: false,
      result: { failureReason: 'NATIVE_APPROVAL_EXPIRED' },
    });
    expect(h.logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'FAILED' }));
    await expect(h.service.local('owner', { ...input, confirmed: false })).rejects.toMatchObject({
      response: { code: 'TOOL_CONFIRMATION_REQUIRED' },
    });
  });
  it.each(['ACE 읽기 테스트 123', ''])(
    '클립보드 결과를 AI에 전달하되 실행 로그와 TOOL 메시지에는 원문 미저장',
    async (text) => {
      const h = harness();
      h.claims.toolName = ToolName.CLIPBOARD_READ;
      await h.service.local('owner', { ...input, result: { text, ignored: 'not forwarded' } });
      expect(h.ai.generate).toHaveBeenCalledWith({
        toolResults: [expect.objectContaining({ tool: 'clipboard.read', result: { text } })],
      });
      expect(h.messages.append).toHaveBeenCalledWith(
        'owner',
        'owned',
        'TOOL',
        'clipboard.read: SUCCEEDED',
      );
      expect(h.logs.record.mock.calls[0][0]).not.toHaveProperty('result');
    },
  );
  it('읽기 결과 누락·과대 크기·잘못된 형식은 AI 전송 전에 거부', async () => {
    const h = harness();
    h.claims.toolName = ToolName.CLIPBOARD_READ;
    for (const result of [{}, { text: 1 }, { text: '가'.repeat(22000) }])
      await expect(h.service.local('owner', { ...input, result })).rejects.toMatchObject({
        response: { code: 'VALIDATION_ERROR' },
      });
    expect(h.ai.generate).not.toHaveBeenCalled();
    expect(h.logs.record).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    '완료한 검색을 AI 누락 안내·연결 오류로 실패 처리하지 않음: %s',
    async (upstreamFails) => {
      const h = harness();
      h.claims.toolName = ToolName.FILE_SEARCH;
      if (upstreamFails) h.ai.generate.mockRejectedValue(new Error('upstream unavailable'));
      else
        h.ai.generate.mockResolvedValue({
          toolCalls: [],
          content: '파일 검색 결과 목록을 받지 못했습니다.',
        } as never);
      await h.service.local('owner', {
        ...input,
        result: { search: { count: 1, partial: false, displayedLocally: true } },
      });
      expect(h.logs.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCEEDED' }));
      expect(h.responses.deliver).toHaveBeenCalledWith('owner', 'owned', {
        content: expect.stringContaining('검색 결과 1개'),
        toolCalls: [],
      });
    },
  );
  it('다른 실행 ID 및 미승인·차단 결과를 기록하지 않음', async () => {
    const h = harness();
    await expect(
      h.service.local('owner', { ...input, executionId: '00000000-0000-4000-8000-000000000002' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_TOOL_TICKET' } });
    await expect(h.service.local('owner', { ...input, confirmed: false })).rejects.toMatchObject({
      response: { code: 'TOOL_CONFIRMATION_REQUIRED' },
    });
    h.permissions.effective.mockResolvedValue({ denied: true, requiresConfirmation: true });
    await expect(h.service.local('owner', input)).rejects.toMatchObject({
      response: { code: 'TOOL_PERMISSION_DENIED' },
    });
    expect(h.logs.record).not.toHaveBeenCalled();
  });
  it('유일 실행 ID 기록 후 같은 결과는 AI 재호출·메시지 중복 저장 없이 거부', async () => {
    const h = harness();
    h.logs.record.mockResolvedValueOnce({}).mockRejectedValueOnce({ code: 'P2002' });
    await h.service.local('owner', input);
    await expect(h.service.local('owner', input)).rejects.toMatchObject({
      response: { code: 'CONFLICT' },
    });
    expect(h.logs.record.mock.calls[0][0]).toMatchObject({ executionId: h.claims.callId });
    expect(h.ai.generate).toHaveBeenCalledTimes(1);
    expect(h.messages.append).toHaveBeenCalledTimes(1);
  });
});
