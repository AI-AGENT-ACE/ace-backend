import { IsEnum, IsIn, IsInt, Max, Min } from 'class-validator';
import { VoiceCommandStatus } from '../../generated/prisma/client';
import { OptionalField } from '../../common/validation/optional-field.decorator';

export class CreateVoiceLogDto {
  @IsIn(['system.status', 'app.open', 'app.close', 'unsupported'])
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
