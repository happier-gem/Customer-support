import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AuthServiceModule } from './auth-service.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AuthServiceModule, {
    transport: Transport.TCP,
    options: {
      host: process.env.AUTH_SERVICE_HOST ?? '127.0.0.1',
      port: Number(process.env.AUTH_SERVICE_PORT ?? 4001),
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen();
  // eslint-disable-next-line no-console
  console.log(
    `auth-service microservice listening on TCP ${process.env.AUTH_SERVICE_HOST ?? '127.0.0.1'}:${process.env.AUTH_SERVICE_PORT ?? 4001}`,
  );
}
bootstrap();
