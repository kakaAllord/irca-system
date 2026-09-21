import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ClsService } from 'nestjs-cls';
import type { IncomingMessage } from 'node:http';
import { AppConfig } from '../../config/app-config.js';
import type { RequestContext } from '../context/request-context.js';

/**
 * One JSON line per request in production, readable lines in development.
 *
 * Every line carries the request id and, once the session guard has run, who
 * the request was for and which church. That is what lets one request be
 * followed through the logs, including who was really behind an impersonation.
 * Credentials never reach a log line: cookies, authorisation headers,
 * Set-Cookie and any password field are redacted before writing.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig, ClsService],
      useFactory: (config: AppConfig, cls: ClsService<RequestContext>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          transport: config.isProduction
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
              },
          genReqId: () => cls.getId(),
          // What a request line needs, not every header the response carried.
          serializers: {
            req: (req: { id: string; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          // Read at every line, so it reflects whatever the guards have set by then.
          mixin: () =>
            cls.isActive()
              ? {
                  userId: cls.get('userId') ?? undefined,
                  actorUserId: cls.get('actorUserId') ?? undefined,
                  churchId: cls.get('churchId') ?? undefined,
                }
              : {},
          redact: {
            paths: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers["set-cookie"]',
              '*.password',
              '*.newPassword',
              '*.currentPassword',
            ],
            censor: '[redacted]',
          },
          autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' },
        },
      }),
    }),
  ],
})
export class LoggingModule {}
