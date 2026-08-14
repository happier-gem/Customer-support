import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TicketsController } from './tickets.controller';

@Module({
  imports: [AuthModule],
  controllers: [TicketsController],
})
export class TicketsModule {}
