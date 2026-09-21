import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Response } from 'express';
import { ErrorCode, type ApiError } from '@irca/shared';
import { AppError } from './app-error.js';

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
  503: ErrorCode.SERVICE_UNAVAILABLE,
};

/** Prisma's error classes, recognised by shape so this file need not import the client. */
function prismaCode(e: unknown): string | undefined {
  const err = e as { name?: string; code?: unknown };
  return err?.name === 'PrismaClientKnownRequestError' && typeof err.code === 'string'
    ? err.code
    : undefined;
}

/**
 * Turns every error into the one shape the portal knows, ApiError.
 *
 * Anything the API did not throw on purpose becomes a 500 with a generic
 * message: the real error, which can hold SQL or stack traces, goes to the log
 * under the request id, and the client gets only the id to quote.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  constructor(private readonly cls: ClsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toApiError(exception);

    if (status >= 500) this.logger.error(exception);
    res.status(status).json(body);
  }

  private toApiError(e: unknown): { status: number; body: ApiError } {
    const requestId = this.cls.getId() ?? 'unknown';

    if (e instanceof AppError) {
      return {
        status: e.getStatus(),
        body: { error: { code: e.code, message: e.message, details: e.details }, requestId },
      };
    }

    const prisma = prismaCode(e);
    if (prisma === 'P2002') {
      return {
        status: 409,
        body: { error: { code: ErrorCode.CONFLICT, message: 'That already exists.' }, requestId },
      };
    }
    if (prisma === 'P2025') {
      return {
        status: 404,
        body: { error: { code: ErrorCode.NOT_FOUND, message: 'Not found.' }, requestId },
      };
    }

    if (e instanceof HttpException) {
      const status = e.getStatus();
      const code =
        CODE_BY_STATUS[status] ?? (status >= 500 ? ErrorCode.INTERNAL : ErrorCode.CONFLICT);
      return { status, body: { error: { code, message: messageOf(e) }, requestId } };
    }

    return {
      status: 500,
      body: {
        error: {
          code: ErrorCode.INTERNAL,
          message: 'Something went wrong. Quote the request id if you report it.',
        },
        requestId,
      },
    };
  }
}

function messageOf(e: HttpException): string {
  const r = e.getResponse();
  const raw = typeof r === 'string' ? r : (r as { message?: unknown }).message;
  // Nest turns a body the JSON parser rejects into a plain 400 carrying the
  // parser's own wording, which describes our internals rather than what the
  // caller should fix. Our own validation errors are AppErrors and never get here.
  if (e.getStatus() === 400 && typeof raw === 'string' && /JSON/.test(raw)) {
    return 'The request body is not valid JSON.';
  }
  if (Array.isArray(raw)) return raw.join('. ');
  return typeof raw === 'string' ? raw : e.message;
}
