import { mkdirSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { GatewayModule } from './gateway.module';
import { UPLOADS_DIR } from './organizations/logo-upload.config';

async function bootstrap() {
  mkdirSync(join(UPLOADS_DIR, 'logos'), { recursive: true });

  const app = await NestFactory.create<NestExpressApplication>(GatewayModule);

  // helmet's default CSP would block <img> tags loading uploaded logos back
  // from this same origin under `crossorigin` fetch semantics; disabling CSP
  // here is fine since the gateway serves no HTML of its own.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.useStaticAssets(UPLOADS_DIR, { prefix: '/uploads/' });

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Gateway (HTTP) listening on http://localhost:${port}`);
}
bootstrap();
