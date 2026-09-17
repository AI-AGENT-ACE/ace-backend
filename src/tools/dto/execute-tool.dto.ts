import { IsBoolean, IsEnum, IsObject, ValidateIf } from 'class-validator';
import { ToolName } from '../catalog/tool-name';

export class ExecuteToolDto {
  @IsEnum(ToolName)
  toolName!: ToolName;
  @IsObject()
  arguments!: Record<string, unknown>;
  @ValidateIf((_, value: unknown) => value !== undefined)
  @IsBoolean()
  confirmed = false;
}
