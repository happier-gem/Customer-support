import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TicketsGateway } from './tickets.gateway';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  providers: [TicketsGateway],
  exports: [TicketsGateway],
})
export class RealtimeModule {}
