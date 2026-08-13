import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    MailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m') as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
