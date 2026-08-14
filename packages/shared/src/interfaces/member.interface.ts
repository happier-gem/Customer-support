import type { Role } from '../constants/roles';

export interface MemberDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}
