import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitationsController } from './invitations.controller';
import { TeamInvitationsController } from './team-invitations.controller';

@Module({
  imports: [AuthModule],
  controllers: [InvitationsController, TeamInvitationsController],
})
export class InvitationsModule {}
