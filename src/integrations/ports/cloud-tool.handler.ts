import { ToolName } from '../../tools/catalog/tool-name';

export interface CloudToolHandler {
  readonly toolName: ToolName;
  execute(arguments_: Record<string, unknown>): Promise<unknown>;
}
