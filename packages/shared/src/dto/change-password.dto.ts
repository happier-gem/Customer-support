import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Used by PATCH /auth/me/password. Requires the current password (never trusts an authenticated session alone to change credentials). */
export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one number',
  })
  newPassword!: string;
}
