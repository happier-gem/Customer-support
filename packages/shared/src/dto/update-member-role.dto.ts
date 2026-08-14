import { IsIn } from 'class-validator';
import { ASSIGNABLE_TEAM_ROLES, type AssignableTeamRole } from '../constants/roles';

export class UpdateMemberRoleDto {
  @IsIn(ASSIGNABLE_TEAM_ROLES)
  role!: AssignableTeamRole;
}
