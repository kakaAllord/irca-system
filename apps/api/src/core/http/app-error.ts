import { HttpException } from '@nestjs/common';
import { ErrorCode } from '@irca/shared';

/** An error the API means to send, with a code the portal understands. */
export class AppError extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export const notFound = (message = 'Not found.') => new AppError(404, ErrorCode.NOT_FOUND, message);
export const forbidden = (message = 'You do not have access to this.', details?: unknown) =>
  new AppError(403, ErrorCode.FORBIDDEN, message, details);
export const conflict = (
  message: string,
  code: ErrorCode = ErrorCode.CONFLICT,
  details?: unknown,
) => new AppError(409, code, message, details);
export const validation = (details: unknown, message = 'Some fields need attention.') =>
  new AppError(400, ErrorCode.VALIDATION_FAILED, message, details);
