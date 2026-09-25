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
 * Invitation and password-reset tokens travel in the URL or the body; the
 * body is never logged, but `req.url` is, and an invitation's token
 * (`GET /invitations/:token`) sits right there in the path. Any segment that
 * is long and random-looking — 20 or more letters, digits, `-` or `_`, the
 * shape every token and api key here takes, and not a uuid — is redacted
 * before the line is ever written, rather than trying to name every route
 * that carries one.
 */
export function redactUrl(url: string): string {
  return url.replace(/\/([A-Za-z0-9_-]{20,})(?=\/|\?|$)/g, (segment, value: string) =>
    UUID.test(value) ? segment : '/[redacted]',
  );
}

/** A record's id is not a secret, and is the first thing a log is searched for. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One JSON line per request in production, readable lines in development.
 *
 * Every line carries the request id and, once the session guard has run, who
 * the request was for. That is what lets one request be
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
              {
                stream: readable
                  ? pretty({ singleLine: true, translateTime: 'SYS:HH:MM:ss' })
                  : process.stdout,
              },
              { stream: logBuffer.stream() },
            ]),
            genReqId: () => cls.getId(),
            // What a request line needs, not every header the response carried.
            serializers: {
              req: (req: { id: string; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                url: redactUrl(req.url),
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
