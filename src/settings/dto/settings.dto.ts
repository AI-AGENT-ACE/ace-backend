import { IsBoolean, IsEnum, IsString, Matches, MaxLength } from 'class-validator';
import { PermissionPolicy } from '../../generated/prisma/client';
import { OptionalField } from '../../common/validation/optional-field.decorator';

export class UpdateSettingsDto {
  @OptionalField()
  @IsString()
  @MaxLength(35)
  @Matches(/^[a-z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/)
  responseLanguage?: string;
  @OptionalField()
  @IsBoolean()
  ttsEnabled?: boolean;
}

export class UpdatePermissionDto {
  @IsEnum(PermissionPolicy)
  policy!: PermissionPolicy;
}
