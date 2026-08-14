import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AssignableTeamRole, MEMBER_PATTERNS, RpcAuthContext } from '@app/shared';
import { MembersService } from './members.service';
import { RpcExceptionFilter } from '../common/filters/rpc-exception.filter';

@Controller()
@UseFilters(RpcExceptionFilter)
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @MessagePattern(MEMBER_PATTERNS.LIST)
  list(@Payload() data: { authContext: RpcAuthContext }) {
    return this.membersService.list(data.authContext);
  }

  @MessagePattern(MEMBER_PATTERNS.UPDATE_ROLE)
  updateRole(@Payload() data: { authContext: RpcAuthContext; userId: string; role: AssignableTeamRole }) {
    return this.membersService.updateRole(data.authContext, data.userId, data.role);
  }

  @MessagePattern(MEMBER_PATTERNS.REMOVE)
  remove(@Payload() data: { authContext: RpcAuthContext; userId: string }) {
    return this.membersService.remove(data.authContext, data.userId);
  }
}
