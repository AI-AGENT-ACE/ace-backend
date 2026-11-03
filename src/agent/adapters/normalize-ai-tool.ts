import { ToolName } from '../../tools/catalog/tool-name';
export function aiToolDiagnostic(tool: string, args: Record<string, unknown>) {
  const knownKeys = new Set([
    'appName',
    'canonicalId',
    'original',
    'candidates',
    'resourceId',
    'path',
    'directory',
    'query',
    'extensions',
    'limit',
    'newName',
    'destination',
    'sourceDirectory',
    'sourcePath',
    'destinationDirectory',
    'destinationPath',
    'mode',
    'mute',
    'volume',
    'value',
    'url',
    'engine',
    'text',
    'page',
  ]);
  return {
    tool: Object.values(ToolName).includes(tool as ToolName) ? tool : 'unknown',
    argumentKeys: Object.keys(args).filter((key) => knownKeys.has(key)),
    unknownKeyCount: Object.keys(args).filter((key) => !knownKeys.has(key)).length,
  };
}
export function normalizeAiToolArguments(tool: string, args: Record<string, unknown>) {
  if (
    [
      ToolName.APP_OPEN,
      ToolName.APP_CLOSE,
      ToolName.APP_FOCUS,
      ToolName.APP_MINIMIZE,
      ToolName.APP_MAXIMIZE,
    ].includes(tool as ToolName)
  ) {
    if (
      Object.keys(args).some(
        (key) => !['appName', 'canonicalId', 'original', 'candidates'].includes(key),
      )
    )
      return args;
    return { appName: args.appName ?? args.canonicalId ?? args.original };
  }
  return args;
}
