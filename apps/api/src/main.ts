import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { ClsMiddleware } from 'nestjs-cls';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.js';
import { requestContextOptions } from './core/context/context.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  const config = app.get(AppConfig);

  // First, so every later step, body parsing included, runs with a request id.
  app.use(new ClsMiddleware(requestContextOptions).use);

  app.useLogger(app.get(Logger));
  // The portal's rewrite and the host's load balancer sit in front; without
  // this every request would appear to come from them, and per-IP limits
  // would throttle everyone together.
  app.set('trust proxy', config.get('TRUST_PROXY'));
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '256kb' });
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.enableShutdownHooks();

  // No CORS, deliberately: browsers only ever reach this API through the
  // portal's own origin (/api is rewritten here), so there is no cross-origin
  // caller to allow.
  await app.listen(config.get('PORT'));
}
await bootstrap();
