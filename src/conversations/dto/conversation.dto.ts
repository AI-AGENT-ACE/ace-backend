import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import { PageQueryDto } from '../../common/pagination/page.dto';
import { OptionalField } from '../../common/validation/optional-field.decorator';

export class CreateConversationDto {
  @OptionalField()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
}

export class UpdateConversationDto extends CreateConversationDto {
  @OptionalField()
  @IsBoolean()
  isPinned?: boolean;
}

export class ConversationQueryDto extends PageQueryDto {
  limit = 20;
}
