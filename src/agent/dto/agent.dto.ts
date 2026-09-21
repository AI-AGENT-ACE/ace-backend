import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { OptionalField } from '../../common/validation/optional-field.decorator';
import { ToolExecutionStatus } from '../../generated/prisma/client';
import { ToolLogErrorCode } from '../../logs/tool-log.types';

export class AgentTurnDto {
  @IsString()
  @Matches(/^[a-z0-9]{20,40}$/)
  conversationId!: string;
  @IsString()
  @MaxLength(20000)
  content!: string;
  @OptionalField()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @Matches(/^[a-z0-9]{20,40}$/, { each: true })
  attachmentIds: string[] = [];
}

export class ToolTicketDto {
  @IsString()
  @MinLength(32)
  @MaxLength(4096)
  ticket!: string;
  @OptionalField()
  @IsBoolean()
  confirmed = false;
}

export class LocalToolResultDto extends ToolTicketDto {
  @IsEnum(ToolExecutionStatus)
  status!: ToolExecutionStatus;
  @OptionalField()
  @IsObject()
  result?: Record<string, unknown>;
  @OptionalField()
  @IsEnum(ToolLogErrorCode)
  errorCode?: ToolLogErrorCode;
  @OptionalField()
  @IsInt()
  @Min(0)
  @Max(86400000)
  duration?: number;
}

export class AgentCloudToolDto extends ToolTicketDto {
  @IsObject()
  arguments!: Record<string, unknown>;
}
