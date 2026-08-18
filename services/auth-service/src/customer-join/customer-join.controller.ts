import { Controller, UseFilters } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CUSTOMER_JOIN_PATTERNS, RpcAuthContext } from '@app/shared';
import { CustomerJoinService } from './customer-join.service';
import { RpcExceptionFilter } from '../common/filters/rpc-exception.filter';

@Controller()
@UseFilters(RpcExceptionFilter)
export class CustomerJoinController {
  constructor(private readonly customerJoin: CustomerJoinService) {}

  @MessagePattern(CUSTOMER_JOIN_PATTERNS.GET_OR_CREATE)
  getOrCreate(@Payload() data: { authContext: RpcAuthContext }) {
    return this.customerJoin.getOrCreate(data.authContext);
  }

  @MessagePattern(CUSTOMER_JOIN_PATTERNS.REGENERATE)
  regenerate(@Payload() data: { authContext: RpcAuthContext }) {
    return this.customerJoin.regenerate(data.authContext);
  }

  @MessagePattern(CUSTOMER_JOIN_PATTERNS.REVOKE)
  revoke(@Payload() data: { authContext: RpcAuthContext }) {
    return this.customerJoin.revoke(data.authContext);
  }

  @MessagePattern(CUSTOMER_JOIN_PATTERNS.RESOLVE_BY_TOKEN)
  resolveByToken(@Payload() data: { token: string }) {
    return this.customerJoin.resolveByToken(data.token);
  }

  @MessagePattern(CUSTOMER_JOIN_PATTERNS.RESOLVE_BY_CODE)
  resolveByCode(@Payload() data: { code: string }) {
    return this.customerJoin.resolveByCode(data.code);
  }
}
