import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { OptionalField } from '../../common/validation/optional-field.decorator';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class RegisterDto extends LoginDto {
  @OptionalField()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;
}

export class RefreshTokenDto {
  @IsString()
  @MinLength(32)
  @MaxLength(4096)
  refreshToken!: string;
}
