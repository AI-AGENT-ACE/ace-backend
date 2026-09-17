import { ToolExecutionStatus } from '../generated/prisma/client';
import { ToolName } from '../tools/catalog/tool-name';

export enum ToolLogErrorCode {
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  WEATHER_UNAVAILABLE = 'WEATHER_UNAVAILABLE',
  WEATHER_NOT_CONFIGURED = 'WEATHER_NOT_CONFIGURED',
  TOOL_CONFIRMATION_REQUIRED = 'TOOL_CONFIRMATION_REQUIRED',
  LOCAL_EXECUTION_FAILED = 'LOCAL_EXECUTION_FAILED',
  LOCAL_PERMISSION_DENIED = 'LOCAL_PERMISSION_DENIED',
  LOCAL_TOOL_UNAVAILABLE = 'LOCAL_TOOL_UNAVAILABLE',
  LOCAL_TIMEOUT = 'LOCAL_TIMEOUT',
}
export interface ToolLogEntry {
  userId: string;
  toolName: ToolName;
  status: ToolExecutionStatus;
  errorCode?: ToolLogErrorCode;
  duration?: number;
}
