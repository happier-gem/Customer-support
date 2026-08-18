import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsController } from './organizations.controller';
import { CustomerAccessController } from './customer-access.controller';
import { JoinController } from './join.controller';

@Module({
  imports: [AuthModule],
  controllers: [OrganizationsController, CustomerAccessController, JoinController],
})
export class OrganizationsModule {}
