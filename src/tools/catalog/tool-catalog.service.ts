import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PermissionPolicy } from '../../generated/prisma/client';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { ToolExecutionLocation, ToolName } from './tool-name';

export interface ToolDefinition {
  name: ToolName;
  description: string;
  executionLocation: ToolExecutionLocation;
  systemConfirmation: boolean;
  defaultPolicy: PermissionPolicy;
  argumentsSchema: z.ZodType<Record<string, unknown>>;
}

const path = z.string().min(1).max(2048);
const appName = z.string().min(1).max(200);
const definitions: ToolDefinition[] = [
  {
    name: ToolName.WEATHER_CURRENT,
    description: 'Current weather at latitude/longitude',
    executionLocation: ToolExecutionLocation.CLOUD,
    systemConfirmation: false,
    defaultPolicy: PermissionPolicy.ALWAYS_ALLOW,
    argumentsSchema: z
      .object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
      .strict(),
  },
  {
    name: ToolName.APP_OPEN,
    description: 'Request the desktop to open an application',
    executionLocation: ToolExecutionLocation.LOCAL,
    systemConfirmation: false,
    defaultPolicy: PermissionPolicy.ASK,
    argumentsSchema: z.object({ appName }).strict(),
  },
  {
    name: ToolName.APP_CLOSE,
    description: 'Request the desktop to close an application',
    executionLocation: ToolExecutionLocation.LOCAL,
    systemConfirmation: true,
    defaultPolicy: PermissionPolicy.ALWAYS_ASK,
    argumentsSchema: z.object({ appName }).strict(),
  },
  {
    name: ToolName.FILE_OPEN,
    description: 'Request the desktop to open a file',
    executionLocation: ToolExecutionLocation.LOCAL,
    systemConfirmation: false,
    defaultPolicy: PermissionPolicy.ASK,
    argumentsSchema: z.object({ path }).strict(),
  },
  {
    name: ToolName.FILE_RENAME,
    description: 'Request the desktop to rename a file',
    executionLocation: ToolExecutionLocation.LOCAL,
    systemConfirmation: true,
    defaultPolicy: PermissionPolicy.ASK,
    argumentsSchema: z.object({ path, newName: z.string().min(1).max(255) }).strict(),
  },
  {
    name: ToolName.FILE_DELETE,
    description: 'Request the desktop to delete a file',
    executionLocation: ToolExecutionLocation.LOCAL,
    systemConfirmation: true,
    defaultPolicy: PermissionPolicy.ALWAYS_ASK,
    argumentsSchema: z.object({ path }).strict(),
  },
];

@Injectable()
export class ToolCatalog {
  private readonly definitions = new Map(
    definitions.map((definition) => [definition.name, definition]),
  );
  get(name: string): ToolDefinition {
    const definition = this.definitions.get(name as ToolName);
    if (!definition) throw new AppException(400, ErrorCode.UNKNOWN_TOOL, 'Unknown tool');
    return definition;
  }
  validateArguments(name: string, input: unknown) {
    const parsed = this.get(name).argumentsSchema.safeParse(input);
    if (!parsed.success)
      throw new AppException(
        400,
        ErrorCode.INVALID_TOOL_ARGUMENTS,
        'Tool arguments do not match the schema',
      );
    return parsed.data;
  }
  list() {
    return [...this.definitions.values()].map(({ argumentsSchema, ...metadata }) => ({
      ...metadata,
      argumentsSchema: z.toJSONSchema(argumentsSchema),
    }));
  }
}
