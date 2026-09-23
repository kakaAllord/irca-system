import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ClsService } from 'nestjs-cls';
import { multistream } from 'pino';
import pretty from 'pino-pretty';
import type { IncomingMessage } from 'node:http';
import { AppConfig } from '../../config/app-config.js';
import type { RequestContext } from '../context/request-context.js';
import { logBuffer } from './log-buffer.service.js';

/**
 * One JSON line per request in production, readable lines in development.
 *
 * Every line carries the request id and, once the session guard has run, who
 * the request was for and which church. That is what lets one request be
 * followed through the logs, including who was really behind an impersonation.
 * Credentials never reach a log line: cookies, authorisation headers,
 * Set-Cookie and any password field are redacted before writing.
 *
 * Every line also goes to `LogBufferService`, so the dev console can show the
 * recent ones without anybody opening a terminal. Development prettifies
 * through a stream rather than a transport worker, because a transport would
 * take the lines away from the buffer.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfig, ClsService],
      useFactory: (config: AppConfig, cls: ClsService<RequestContext>) => {
        logBuffer.setCapacity(config.get('LOG_BUFFER_LINES'));
        const readable = config.get('NODE_ENV') === 'development';
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL'),
            stream: multistream([
              // Readable lines only in development; JSON everywhere else, tests included.
              { stream: readable ? pretty({ singleLine: true, translateTime: 'SYS:HH:MM:ss' }) : process.stdout },
              { stream: logBuffer.stream() },
            ]),
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
        };
      },
    }),
  ],
})
export class LoggingModule {}
