import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { ClsMiddleware } from 'nestjs-cls';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppConfig } from './config/app-config.js';
import { requestContextOptions } from './core/context/context.module.js';

/**
 * Everything the running API sets up around its modules, shared by main.ts and
 * the end-to-end tests, so the tests exercise the same middleware, in the same
 * order, as production. Create the app with `bodyParser: false`: the body
 * parser is added here, after the request context, so even a body that fails
 * to parse has a request id.
 */
export function configureApp(app: NestExpressApplication): AppConfig {
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
  return config;
}
