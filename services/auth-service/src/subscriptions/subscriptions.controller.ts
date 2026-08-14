import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PlanType, RpcAuthContext, SUBSCRIPTION_PATTERNS } from '@app/shared';
import { SubscriptionsService } from './subscriptions.service';
import { RpcExceptionFilter } from '../common/filters/rpc-exception.filter';

@Controller()
@UseFilters(RpcExceptionFilter)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @MessagePattern(SUBSCRIPTION_PATTERNS.GET)
  get(@Payload() payload: { authContext: RpcAuthContext }) {
    return this.subscriptions.getSubscription(payload.authContext);
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.LIST_PLANS)
  listPlans() {
    return this.subscriptions.listPlans();
  }

  @MessagePattern(SUBSCRIPTION_PATTERNS.CHANGE_PLAN)
  changePlan(@Payload() payload: { authContext: RpcAuthContext; plan: PlanType }) {
    return this.subscriptions.changePlan(payload.authContext, payload.plan);
  }
}
