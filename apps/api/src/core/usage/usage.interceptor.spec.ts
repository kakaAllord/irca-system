import { lastValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { RequestAuth } from '../context/request-auth.js';
import type { UsageService } from './usage.service.js';
import { UsageInterceptor } from './usage.interceptor.js';

/** A usage counter that remembers what it was told, instead of writing it. */
function recorder() {
  const counted = new Map<string, number>();
  const usage = {
    inc: (metric: string, by = 1) => counted.set(metric, (counted.get(metric) ?? 0) + by),
    max: (metric: string, value: number) =>
      counted.set(metric, Math.max(counted.get(metric) ?? 0, value)),
    touchActiveUser: () => undefined,
  } as unknown as UsageService;
  return { usage, counted };
}

function request(ms: number) {
  const req = {
    method: 'GET',
    path: '/v1/finance/transactions',
    route: { path: '/v1/finance/transactions' },
  };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode: 200 }) }),
  } as unknown as ExecutionContext;
  let now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const next: CallHandler = {
    handle: () => {
      now += ms;
      return of({ ok: true });
    },
  };
  return { ctx, next };
}

describe('counting requests', () => {
  afterEach(() => vi.restoreAllMocks());

  it('adds up the time requests took, not how many there were', async () => {
    const { usage, counted } = recorder();
    const interceptor = new UsageInterceptor(usage, { isImpersonating: false } as RequestAuth);

    for (const ms of [120, 30]) {
      const { ctx, next } = request(ms);
      await lastValueFrom(interceptor.intercept(ctx, next));
    }

    expect(counted.get('api.requests')).toBe(2);
    expect(counted.get('api.latency_ms.sum')).toBe(150);
    expect(counted.get('api.latency_ms.max')).toBe(120);
    expect(counted.get('api.route.GET /finance/transactions')).toBe(2);
    expect(counted.get('api.route_ms.GET /finance/transactions')).toBe(150);
  });
});
