import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ADMIN_PATTERNS, RpcAuthContext } from '@app/shared';
import { AdminService, AdminOrganizationListQuery } from './admin.service';
import { RpcExceptionFilter } from '../common/filters/rpc-exception.filter';

@Controller()
@UseFilters(RpcExceptionFilter)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @MessagePattern(ADMIN_PATTERNS.LIST_ORGANIZATIONS)
  listOrganizations(@Payload() data: { authContext: RpcAuthContext } & AdminOrganizationListQuery) {
    const { authContext, ...query } = data;
    return this.admin.listOrganizations(authContext, query);
  }

  @MessagePattern(ADMIN_PATTERNS.GET_ORGANIZATION)
  getOrganization(@Payload() data: { authContext: RpcAuthContext; organizationId: string }) {
    return this.admin.getOrganization(data.authContext, data.organizationId);
  }

  @MessagePattern(ADMIN_PATTERNS.SET_ORGANIZATION_SUSPENDED)
  setSuspended(@Payload() data: { authContext: RpcAuthContext; organizationId: string; isSuspended: boolean }) {
    return this.admin.setSuspended(data.authContext, data.organizationId, data.isSuspended);
  }

  @MessagePattern(ADMIN_PATTERNS.PLATFORM_STATS)
  getPlatformStats(@Payload() data: { authContext: RpcAuthContext }) {
    return this.admin.getPlatformStats(data.authContext);
  }

  @MessagePattern(ADMIN_PATTERNS.LIST_PLANS)
  listPlans(@Payload() data: { authContext: RpcAuthContext }) {
    return this.admin.listPlans(data.authContext);
  }
}
