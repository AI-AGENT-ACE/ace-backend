import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsIn, IsObject, IsString, IsUUID, IsEnum, MaxLength } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { OptionalField } from '../common/validation/optional-field.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ToolTicketService } from './services/tool-ticket.service';
import { ToolCatalog } from '../tools/catalog/tool-catalog.service';
import { ToolName } from '../tools/catalog/tool-name';
import { PermissionsService } from '../settings/permissions.service';
export class ExecutionEventDto {
  @IsString() @MaxLength(8192) ticket!: string;
  @IsUUID() attemptId!: string;
  @OptionalField() @IsUUID() previousAttemptId?: string;
  @IsIn([
    'REQUESTED',
    'WAITING_APPROVAL',
    'APPROVED',
    'RUNNING',
    'SUCCEEDED',
    'FAILED',
    'DENIED',
    'CANCELLED',
    'EXPIRED',
  ])
  state!: string;
}
export class LocalExecutionDto {
  @IsUUID() requestId!: string;
  @IsEnum(ToolName) tool!: ToolName;
  @IsObject() arguments!: Record<string, unknown>;
}
@Controller('agent/executions')
export class NativeTraceController {
  constructor(
    private readonly tickets: ToolTicketService,
    private readonly catalog: ToolCatalog,
    private readonly permissions: PermissionsService,
  ) {}
  @Post() async create(@CurrentUser() user: AuthenticatedUser, @Body() input: LocalExecutionDto) {
    const call = {
      id: randomUUID(),
      tool: input.tool,
      arguments: this.catalog.validateArguments(input.tool, input.arguments),
    };
    const policy = await this.permissions.effective(user.userId, input.tool);
    return {
      ...call,
      executionId: call.id,
      requestId: input.requestId,
      ...policy,
      ticket: await this.tickets.issue(user.userId, '', call, input.requestId),
    };
  }
  @Post('events') event(@CurrentUser() user: AuthenticatedUser, @Body() input: ExecutionEventDto) {
    return this.tickets.event(
      user.userId,
      input.ticket,
      input.attemptId,
      input.state,
      input.previousAttemptId,
    );
  }
  @Get(':id') history(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tickets.history(user.userId, id);
  }
}
