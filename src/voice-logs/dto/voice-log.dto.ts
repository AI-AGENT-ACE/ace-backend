import { IsEnum, IsIn, IsInt, Max, Min } from 'class-validator';
import { VoiceCommandStatus } from '../../generated/prisma/client';
import { OptionalField } from '../../common/validation/optional-field.decorator';
import { ToolName } from '../../tools/catalog/tool-name';

export class CreateVoiceLogDto {
  @IsIn([
    'system.status',
    ...Object.values(ToolName).filter((tool) => tool !== ToolName.WEATHER_CURRENT),
    'unsupported',
  ])
  commandType!: string;

  @IsEnum(VoiceCommandStatus)
  status!: VoiceCommandStatus;

  @IsInt()
  @Min(0)
  @Max(86400000)
  duration!: number;

  @OptionalField()
  @IsIn([
    'BLOCKED',
    'EXECUTION_FAILED',
    'DESKTOP_REQUIRED',
    'CANCELLED',
    'CONFIRMATION_REQUIRED',
    'INVALID_ARGUMENTS',
  ])
  errorCode?: string;
}
