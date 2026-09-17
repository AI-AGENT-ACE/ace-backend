import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { MessageRole } from '../../generated/prisma/client';
import { OptionalField } from '../../common/validation/optional-field.decorator';

export class CreateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  content!: string;

  // Only the trusted server/AI adapter may create ASSISTANT, TOOL or SYSTEM messages.
  @OptionalField()
  @IsIn([MessageRole.USER])
  role: typeof MessageRole.USER = MessageRole.USER;
}
