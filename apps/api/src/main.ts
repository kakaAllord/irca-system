import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  const config = configureApp(app);
  // An idle connection is kept longer than whatever sits in front of the API
  // keeps its own, so the proxy always closes first. With Node's default of
  // five seconds, a request sent on a connection the API was just closing was
  // dropped unanswered, and a visitor saw an error (docs/plan/10, step 10.1).
  const server = app.getHttpServer();
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  await app.listen(config.get('PORT'));
}
await bootstrap();
