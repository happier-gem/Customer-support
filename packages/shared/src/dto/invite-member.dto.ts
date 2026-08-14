import { IsEmail, IsIn, MaxLength } from 'class-validator';
import { ASSIGNABLE_TEAM_ROLES, type AssignableTeamRole } from '../constants/roles';

export class InviteMemberDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsIn(ASSIGNABLE_TEAM_ROLES)
  role!: AssignableTeamRole;
}
