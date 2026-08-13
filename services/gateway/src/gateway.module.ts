import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class GatewayModule {}
