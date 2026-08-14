import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ANALYTICS_PATTERNS, RpcAuthContext } from '@app/shared';
import { AnalyticsService } from './analytics.service';
import { RpcExceptionFilter } from '../common/filters/rpc-exception.filter';

@Controller()
@UseFilters(RpcExceptionFilter)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @MessagePattern(ANALYTICS_PATTERNS.OVERVIEW)
  overview(@Payload() payload: { authContext: RpcAuthContext }) {
    return this.analytics.getOverview(payload.authContext);
  }
}
