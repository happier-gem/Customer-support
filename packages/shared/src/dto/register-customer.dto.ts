import { IsEmail, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Public customer self-signup for an existing organization's support portal
 * (unlike RegisterDto, which creates a brand-new organization owned by a
 * TENANT_OWNER). The created account's role is always CUSTOMER — hardcoded
 * server-side in AuthService.registerCustomer, never client-supplied.
 */
export class RegisterCustomerDto {
  @IsUUID()
  organizationId!: string;

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
