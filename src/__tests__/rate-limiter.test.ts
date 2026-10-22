import { describe, it, expect, vi, afterEach } from 'vitest';
import { RateLimiter } from '../utils/rate-limiter.js';

describe('RateLimiter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not keep the process alive: the cleanup timer is unref-ed', () => {
    const unref = vi.fn();
    const setIntervalSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockReturnValue({ unref } as unknown as ReturnType<typeof setInterval>);
    new RateLimiter({ maxRequests: 1, windowMs: 1000 });
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(unref).toHaveBeenCalledTimes(1);
  });
});
