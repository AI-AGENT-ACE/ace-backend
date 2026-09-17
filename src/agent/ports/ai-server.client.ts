import { MessageRole, ToolExecutionStatus } from '../../generated/prisma/client';
import { ToolExecutionLocation, ToolName } from '../../tools/catalog/tool-name';

export interface AiToolCall {
  id: string;
  tool: ToolName;
  arguments: Record<string, unknown>;
}
export interface AiTurnResponse {
  content?: string;
  toolCalls: AiToolCall[];
}
export interface AiToolResult {
  callId: string;
  tool: ToolName;
  status: ToolExecutionStatus;
  result?: unknown;
}
export interface AiTurnRequest {
  messages: { role: MessageRole; content: string }[];
  responseLanguage: string;
  tools: {
    name: ToolName;
    description: string;
    executionLocation: ToolExecutionLocation;
    argumentsSchema: Record<string, unknown>;
    requiresConfirmation: boolean;
  }[];
  toolResults?: AiToolResult[];
}

export abstract class AiServerClient {
  abstract generate(request: AiTurnRequest): Promise<AiTurnResponse>;
}
