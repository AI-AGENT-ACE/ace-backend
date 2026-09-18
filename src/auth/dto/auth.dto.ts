import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { OptionalField } from '../../common/validation/optional-field.decorator';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class RegisterDto extends LoginDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[\x21-\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]).+$/, {
    message: 'Password must include an English letter, a number and a symbol',
  })
  declare password: string;

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
