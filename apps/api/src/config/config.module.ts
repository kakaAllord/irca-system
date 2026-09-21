import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfig } from './app-config.js';
import { validateEnv } from './env.js';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      // Tests run against their own database, so they read their own file.
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate: validateEnv,
    }),
  ],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}
