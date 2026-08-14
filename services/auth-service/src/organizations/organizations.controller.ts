import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ORG_PATTERNS, RpcAuthContext } from '@app/shared';
import { OrganizationsService } from './organizations.service';
import { RpcExceptionFilter } from '../common/filters/rpc-exception.filter';

@Controller()
@UseFilters(RpcExceptionFilter)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @MessagePattern(ORG_PATTERNS.GET_BY_ID)
  getById(@Payload() data: { authContext: RpcAuthContext; organizationId: string }) {
    return this.organizationsService.getById(data.authContext, data.organizationId);
  }

  @MessagePattern(ORG_PATTERNS.UPDATE)
  update(@Payload() data: { authContext: RpcAuthContext; organizationId: string; name: string }) {
    return this.organizationsService.update(data.authContext, data.organizationId, data.name);
  }

  @MessagePattern(ORG_PATTERNS.LIST)
  list(@Payload() data: { authContext: RpcAuthContext }) {
    return this.organizationsService.list(data.authContext);
  }
}
