import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  organizationName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one number',
  })
  password!: string;
}
