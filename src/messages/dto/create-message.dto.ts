import { ArrayMaxSize, IsArray, IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { MessageRole } from '../../generated/prisma/client';
import { OptionalField } from '../../common/validation/optional-field.decorator';

export class CreateMessageDto {
  @IsString()
  @MaxLength(20000)
  content!: string;

  @OptionalField()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @Matches(/^[a-z0-9]{20,40}$/, { each: true })
  attachmentIds: string[] = [];

  // Only the trusted server/AI adapter may create ASSISTANT, TOOL or SYSTEM messages.
  @OptionalField()
  @IsIn([MessageRole.USER])
  role: typeof MessageRole.USER = MessageRole.USER;
}
