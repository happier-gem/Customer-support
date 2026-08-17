import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TicketsController } from './tickets.controller';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [TicketsController],
})
export class TicketsModule {}
