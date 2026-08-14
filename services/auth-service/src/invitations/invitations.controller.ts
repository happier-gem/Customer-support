import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AssignableTeamRole, INVITATION_PATTERNS, RpcAuthContext } from '@app/shared';
import { InvitationsService } from './invitations.service';
import { RpcExceptionFilter } from '../common/filters/rpc-exception.filter';

@Controller()
@UseFilters(RpcExceptionFilter)
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @MessagePattern(INVITATION_PATTERNS.CREATE)
  create(@Payload() data: { authContext: RpcAuthContext; email: string; role: AssignableTeamRole }) {
    return this.invitationsService.create(data.authContext, data.email, data.role);
  }

  @MessagePattern(INVITATION_PATTERNS.LIST)
  list(@Payload() data: { authContext: RpcAuthContext }) {
    return this.invitationsService.list(data.authContext);
  }

  @MessagePattern(INVITATION_PATTERNS.VALIDATE)
  validate(@Payload() data: { token: string }) {
    return this.invitationsService.validate(data.token);
  }

  @MessagePattern(INVITATION_PATTERNS.ACCEPT)
  accept(@Payload() data: { token: string; name: string; password: string }) {
    return this.invitationsService.accept(data.token, data.name, data.password);
  }
}
