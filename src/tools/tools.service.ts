import { Injectable } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code';
import { ToolExecutionStatus } from '../generated/prisma/client';
import { IntegrationRegistry } from '../integrations/integration-registry.service';
import { LogsService } from '../logs/logs.service';
import { ToolLogErrorCode } from '../logs/tool-log.types';
import { PermissionsService } from '../settings/permissions.service';
import { WeatherService } from '../weather/weather.service';
import { ToolCatalog } from './catalog/tool-catalog.service';
import { ToolExecutionLocation, ToolName } from './catalog/tool-name';
import { ExecuteToolDto } from './dto/execute-tool.dto';

@Injectable()
export class ToolsService {
  constructor(
    private readonly catalog: ToolCatalog,
    private readonly permissions: PermissionsService,
    private readonly integrations: IntegrationRegistry,
    private readonly logs: LogsService,
    weather: WeatherService,
  ) {
    integrations.register({
      toolName: ToolName.WEATHER_CURRENT,
      execute: (arguments_) =>
        weather.current({
          latitude: arguments_.latitude as number,
          longitude: arguments_.longitude as number,
        }),
    });
  }
  list() {
    return this.catalog.list();
  }

  async execute(userId: string, input: ExecuteToolDto) {
    const definition = this.catalog.get(input.toolName);
    const arguments_ = this.catalog.validateArguments(input.toolName, input.arguments);
    if (definition.executionLocation === ToolExecutionLocation.LOCAL) {
      throw new AppException(
        400,
        ErrorCode.LOCAL_EXECUTION_NOT_SUPPORTED,
        'Local tools must be executed by the desktop runtime',
      );
    }
    const policy = await this.permissions.effective(userId, definition.name);
    const started = performance.now();
    if (policy.requiresConfirmation && input.confirmed !== true) {
      await this.logs.record({
        userId,
        toolName: definition.name,
        status: ToolExecutionStatus.DENIED,
        errorCode: ToolLogErrorCode.TOOL_CONFIRMATION_REQUIRED,
      });
      throw new AppException(
        409,
        ErrorCode.TOOL_CONFIRMATION_REQUIRED,
        'Explicit confirmation is required',
      );
    }
    const handler = this.integrations.find(definition.name);
    if (!handler)
      throw new AppException(
        503,
        ErrorCode.TOOL_EXECUTION_FAILED,
        'Cloud tool handler is unavailable',
      );
    let result: unknown;
    try {
      result = await handler.execute(arguments_);
    } catch (error) {
      const candidate =
        error instanceof AppException ? (error.getResponse() as { code: string }).code : '';
      const errorCode =
        Object.values(ToolLogErrorCode).find((code) => code === candidate) ??
        ToolLogErrorCode.TOOL_EXECUTION_FAILED;
      await this.logs.record({
        userId,
        toolName: definition.name,
        status: ToolExecutionStatus.FAILED,
        errorCode,
        duration: performance.now() - started,
      });
      if (error instanceof AppException) throw error;
      throw new AppException(502, ErrorCode.TOOL_EXECUTION_FAILED, 'Cloud tool execution failed');
    }
    await this.logs.record({
      userId,
      toolName: definition.name,
      status: ToolExecutionStatus.SUCCEEDED,
      duration: performance.now() - started,
    });
    return { toolName: definition.name, result };
  }
}
