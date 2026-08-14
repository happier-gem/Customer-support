import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * The invitation token travels in the URL (`/invitations/:token/accept`),
 * not here. There is deliberately no `email`, `role`, or `organizationId`
 * field either — those are re-derived server-side from the invitation the
 * token resolves to, never accepted from the client.
 */
export class AcceptInvitationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one number',
  })
  password!: string;
}
