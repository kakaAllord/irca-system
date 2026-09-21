import type { ApiError, ErrorCode } from '@irca/shared';

/** A non-2xx answer from the API, carrying its code, message and field errors. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK';
  readonly requestId: string | null;
  readonly fieldErrors: Record<string, string[]>;

  constructor(status: number, body: ApiError | null) {
    super(body?.error.message ?? 'Something went wrong. Try again in a moment.');
    this.status = status;
    this.code = body?.error.code ?? 'NETWORK';
    this.requestId = body?.requestId ?? null;
    const details = body?.error.code === 'VALIDATION_FAILED' ? body.error.details : null;
    this.fieldErrors = (details && typeof details === 'object' ? details : {}) as Record<
      string,
      string[]
    >;
  }
}

export async function readApiError(res: Response): Promise<ApiRequestError> {
  const body = (await res.json().catch(() => null)) as ApiError | null;
  return new ApiRequestError(res.status, body?.error ? body : null);
}
