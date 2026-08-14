import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
  imports: [AuthModule],
  controllers: [SubscriptionsController],
})
export class SubscriptionsModule {}
