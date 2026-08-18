import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CustomerJoinController } from './customer-join.controller';
import { CustomerJoinService } from './customer-join.service';

@Module({
  imports: [PrismaModule],
  controllers: [CustomerJoinController],
  providers: [CustomerJoinService],
  exports: [CustomerJoinService],
})
export class CustomerJoinModule {}
