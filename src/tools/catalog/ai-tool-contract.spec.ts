import { ToolCatalog } from './tool-catalog.service';
import { normalizeAiToolArguments, aiToolDiagnostic } from '../../agent/adapters/normalize-ai-tool';
describe('current AI file/capture contracts', () => {
  it('실제 AI의 이름 검색 home 참조를 허용하고 파일 변경 범위는 넓히지 않음', () => {
    const catalog = new ToolCatalog();
    const actual = {
      query: { original: 'asdf.txt', candidates: ['asdf.txt'] },
      directory: { original: '홈', candidates: ['홈', 'Home', '사용자 폴더'], canonicalId: 'home' },
      extensions: [],
      limit: 20,
    };
    expect(catalog.validateArguments('file.search', actual)).toEqual(actual);
    expect(() =>
      catalog.validateArguments('file.delete', { directory: 'home', path: 'test.txt' }),
    ).toThrow();
    expect(() =>
      catalog.validateArguments('file.search', {
        ...actual,
        directory: { ...actual.directory, canonicalId: 'arbitrary' },
      }),
    ).toThrow();
  });
  it('C 드라이브는 검색 전용이고 목적지 없는 복사는 사본 생성 계약', () => {
    const catalog = new ToolCatalog();
    for (const tool of ['file.search', 'folder.search']) {
      expect(() =>
        catalog.validateArguments(tool, { query: 'test.txt', directory: 'drive_c' }),
      ).not.toThrow();
      expect(() => catalog.validateArguments(tool, { query: 'test.txt' })).not.toThrow();
    }
    expect(() =>
      catalog.validateArguments('file.copy', {
        sourceDirectory: 'desktop',
        sourcePath: 'test.txt',
      }),
    ).not.toThrow();
    expect(() =>
      catalog.validateArguments('file.move', {
        sourceDirectory: 'desktop',
        sourcePath: 'test.txt',
      }),
    ).toThrow();
    expect(() =>
      catalog.validateArguments('file.delete', { directory: 'drive_c', path: 'Windows/test.txt' }),
    ).toThrow();
  });
  it('settings pages reject arbitrary URI, commands, unknown fields and non-string values', () => {
    const catalog = new ToolCatalog();
    for (const args of [{}, { page: '' }, { page: 'display' }])
      expect(() => catalog.validateArguments('system.open_settings', args)).not.toThrow();
    for (const args of [
      { page: null },
      { page: 5 },
      { page: 'ms-settings:display' },
      { page: 'https://example.com' },
      { page: 'cmd /c calc' },
      { page: 'display', command: 'calc' },
    ])
      expect(() => catalog.validateArguments('system.open_settings', args)).toThrow();
  });
  const catalog = new ToolCatalog();
  const intent = {
    directory: { canonicalId: 'desktop', original: '바탕화면', candidates: ['Desktop'] },
    query: { original: 'ACE_테스트.pdf', candidates: ['ACE_테스트.pdf'] },
    extensions: [],
  };
  it('accepts the actual AI search/open intent without turning it into an executable path', () => {
    for (const tool of ['file.search', 'file.open'])
      expect(catalog.validateArguments(tool, intent)).toEqual(intent);
    expect(() =>
      catalog.validateArguments('file.open', { ...intent, shell: 'anything' }),
    ).toThrow();
    expect(catalog.validateArguments('screen.capture', { mode: 'full' })).toEqual({ mode: 'full' });
    expect(() =>
      catalog.validateArguments('screen.capture', { mode: 'full', monitorId: 'from-ai' }),
    ).toThrow();
  });
  it('lets local scope selection handle searches without a guessed directory', () => {
    const { directory: _directory, ...unscoped } = intent;
    expect(_directory).toBeDefined();
    expect(catalog.validateArguments('file.search', unscoped)).toEqual(unscoped);
    expect(
      catalog.validateArguments(
        'app.maximize',
        normalizeAiToolArguments('app.maximize', {
          canonicalId: 'notepad',
          original: '메모장',
          candidates: ['notepad'],
        }),
      ),
    ).toEqual({ appName: 'notepad' });
  });
  it('diagnostics contain only fixed keys and no argument content', () => {
    const copy = { query: '바탕화면 ACE-Native-Test 폴더의 원본.txt', extensions: ['txt'] };
    expect(catalog.validateArguments('file.copy', copy)).toEqual(copy);
    expect(() => catalog.validateArguments('file.move', copy)).toThrow();
    const value = aiToolDiagnostic('file.open', {
      query: 'private text',
      'C:/private.txt': 'private',
    });
    expect(value).toEqual({ tool: 'file.open', argumentKeys: ['query'], unknownKeyCount: 1 });
    expect(JSON.stringify(value)).not.toContain('private');
  });
});
