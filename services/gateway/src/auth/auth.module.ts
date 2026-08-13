import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AUTH_SERVICE_CLIENT } from '@app/shared';
import { AuthController } from './auth.controller';
import { AuthGatewayService } from './auth-gateway.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    ClientsModule.registerAsync([
      {
        name: AUTH_SERVICE_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.TCP,
          options: {
            host: config.get<string>('AUTH_SERVICE_HOST') ?? '127.0.0.1',
            port: Number(config.get<string>('AUTH_SERVICE_PORT') ?? 4001),
          },
        }),
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthGatewayService, JwtStrategy],
  exports: [AuthGatewayService],
})
export class AuthModule {}
