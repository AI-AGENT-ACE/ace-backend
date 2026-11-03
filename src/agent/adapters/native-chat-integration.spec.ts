import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { HttpAiServerClient } from './http-ai-server.client';
import { ToolCatalog } from '../../tools/catalog/tool-catalog.service';
import { ToolName, ToolExecutionLocation } from '../../tools/catalog/tool-name';
import { PermissionsService } from '../../settings/permissions.service';
import { AgentResponseService } from '../services/agent-response.service';
import { ToolTicketService } from '../services/tool-ticket.service';

// Real adapter -> catalog -> permissions -> signed ticket -> desktop response.
// Only external AI transport and persistence are mocked; no user files are touched.
describe('Native 채팅 전달 통합', () => {
  const catalog = new ToolCatalog();
  const config = {
    get: (name: string) => (name === 'AI_SERVER_URL' ? 'https://ai.test' : 120000),
    getOrThrow: () => 'integration-test-only-signing-key',
  } as unknown as ConfigService;
  const cases: [ToolName, Record<string, unknown>][] = [
    [ToolName.APP_OPEN, { appName: 'notepad' }],
    [ToolName.APP_CLOSE, { appName: 'notepad' }],
    [ToolName.APP_FOCUS, { appName: 'notepad' }],
    [ToolName.APP_MINIMIZE, { appName: 'notepad' }],
    [ToolName.APP_MAXIMIZE, { appName: 'notepad' }],
    [ToolName.FILE_OPEN, { resourceId: 'local-resource' }],
    [ToolName.FOLDER_OPEN, { directory: 'desktop' }],
    [ToolName.FOLDER_SEARCH, { directory: 'desktop', query: '테스트' }],
    [ToolName.FOLDER_CREATE, { parent: 'desktop', name: '테스트' }],
    [ToolName.WEB_OPEN, { url: 'https://example.com' }],
    [ToolName.WEB_SEARCH, { engine: 'google', query: '한글 공백 & 검색' }],
    [ToolName.CLIPBOARD_WRITE, { text: '테스트 전용 텍스트' }],
    [ToolName.CLIPBOARD_READ, {}],
    [ToolName.VOICE_ACTIVATE, {}],
    [ToolName.SYSTEM_VOLUME_SET, { level: 50 }],
    [ToolName.SYSTEM_VOLUME_MUTE, { mute: false }],
    [ToolName.SYSTEM_OPEN_SETTINGS, { page: 'sound' }],
    [ToolName.SYSTEM_LOCK, {}],
    [
      ToolName.FILE_COPY,
      {
        query: { original: '원본.txt', candidates: ['원본.txt'] },
        extensions: [],
        destination: { original: '대상.txt', candidates: ['대상.txt'] },
      },
    ],
    [
      ToolName.FILE_DELETE,
      { query: { original: '대상.txt', candidates: ['대상.txt'] }, extensions: [] },
    ],
    [
      ToolName.FILE_COPY,
      {
        sourceDirectory: 'desktop',
        sourcePath: 'ACE테스트/원본.txt',
        destinationDirectory: 'desktop',
        destinationPath: 'ACE테스트/대상.txt',
      },
    ],
    [
      ToolName.FILE_MOVE,
      {
        resourceId: 'local-resource',
        destinationDirectory: 'desktop',
        destinationPath: 'ACE테스트/대상.txt',
      },
    ],
    [
      ToolName.FILE_RENAME,
      { directory: 'desktop', path: 'ACE테스트/원본.txt', newName: '대상.txt' },
    ],
    [ToolName.FILE_DELETE, { directory: 'desktop', path: 'ACE테스트/대상.txt' }],
    [ToolName.FILE_DELETE, { resourceId: 'local-resource' }],
    [ToolName.FILE_SEARCH, { directory: 'desktop', query: '원본', limit: 20 }],
    [ToolName.SCREEN_CAPTURE, {}],
  ];
  async function deliver(tool: ToolName, args: Record<string, unknown>) {
    const http = {
      request: jest.fn().mockResolvedValue({
        conversationId: 'remote',
        response: { type: 'tool_call', tool, arguments: args },
      }),
    };
    const client = new HttpAiServerClient(
      config,
      http as never,
      {
        lookup: jest.fn().mockResolvedValue('remote'),
        remember: jest.fn(),
        title: jest.fn(),
      } as never,
    );
    const messages = {
      append: jest.fn().mockImplementation(async (_user, _conversation, role, content) => ({
        id: 'assistant',
        role,
        content,
      })),
    };
    const permissions = new PermissionsService(
      { permission: jest.fn().mockResolvedValue(null) } as never,
      catalog,
    );
    const tickets = new ToolTicketService(new JwtService(), config, {
      nativeExecution: { create: jest.fn() },
    } as never);
    const service = new AgentResponseService(messages as never, catalog, permissions, tickets);
    const generated = await client.generate({
      userId: 'owner',
      conversationId: 'local',
      messages: [{ role: 'USER', content: '테스트 요청' }],
      tools: [],
      responseLanguage: 'ko',
    });
    return { result: await service.deliver('owner', 'local', generated), messages, tickets };
  }
  it.each(cases)(
    '%s가 실제 카탈로그와 승인 정책을 거쳐 유효한 티켓으로 전달',
    async (tool, args) => {
      const { result, tickets } = await deliver(tool, args);
      expect(result.toolCalls).toHaveLength(1);
      const call = result.toolCalls[0];
      if (!call) throw new Error('Native 도구 호출이 전달되지 않음');
      expect(call).toMatchObject({
        tool,
        arguments: args,
        executionLocation: ToolExecutionLocation.LOCAL,
      });
      expect(call.requiresConfirmation).toBe(catalog.get(tool).systemConfirmation);
      expect(await tickets.verify('owner', call.ticket)).toMatchObject({
        toolName: tool,
        conversationId: 'local',
      });
      await expect(tickets.verify('another-user', call.ticket)).rejects.toMatchObject({
        response: { code: 'INVALID_TOOL_TICKET' },
      });
    },
  );
  it('외부 Native 도구가 정확히 24개이고 JSON 입력·결과 계약을 제공', () => {
    const tools = catalog.list();
    expect(tools).toHaveLength(24);
    expect(new Set(tools.map((t) => t.name)).size).toBe(24);
    expect(new Set(cases.map(([name]) => name))).toEqual(new Set(tools.map((t) => t.name)));
    for (const tool of tools) {
      expect(tool.executionLocation).toBe('LOCAL');
      expect(tool.argumentsSchema).toHaveProperty('$schema');
      expect(tool.resultSchema).toHaveProperty('properties.status.enum');
    }
    for (const name of ['shell.execute', 'weather.current', 'app.kill', 'file.permanent_delete'])
      expect(() => catalog.get(name)).toThrow();
  });
  it.each([
    [ToolName.FILE_DELETE, { path: 'a.txt', permanent: true }],
    [
      ToolName.FILE_COPY,
      {
        sourceDirectory: 'desktop',
        sourcePath: 'a.txt',
        destinationDirectory: 'desktop',
        destinationPath: 'b.txt',
        overwriteToken: 'ai-forged',
      },
    ],
    [ToolName.SCREEN_CAPTURE, { monitorId: 'ai-forged', mode: 'full' }],
  ] as [ToolName, Record<string, unknown>][])(
    '%s 잘못된 인자는 티켓 없이 채팅 안내로 반환',
    async (tool, args) => {
      const { result, messages } = await deliver(tool, args);
      expect(result.toolCalls).toEqual([]);
      expect(result.message?.content).toContain('아무 작업도 실행하지 않았습니다');
      expect(messages.append).toHaveBeenCalledTimes(1);
    },
  );
});
