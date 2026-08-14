import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MembersController } from './members.controller';

@Module({
  imports: [AuthModule],
  controllers: [MembersController],
})
export class MembersModule {}
