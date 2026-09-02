type RateWindow = { startedAt: number; count: number };

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, RateWindow>();
  private readonly now: () => number;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    now: () => number = () => Date.now(),
  ) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error("limit must be a positive integer");
    }
    if (!Number.isInteger(windowMs) || windowMs < 1) {
      throw new Error("windowMs must be a positive integer");
    }
    this.now = now;
  }

  allow(key: string): boolean {
    const currentTime = this.now();
    let window = this.windows.get(key);
    if (!window || currentTime >= window.startedAt + this.windowMs) {
      window = { startedAt: currentTime, count: 0 };
      this.windows.set(key, window);
    }
    if (window.count >= this.limit) {
      return false;
    }
    window.count += 1;
    return true;
  }

  remaining(key: string): number {
    const window = this.windows.get(key);
    if (!window || this.now() >= window.startedAt + this.windowMs) {
      return this.limit;
    }
    return Math.max(0, this.limit - window.count);
  }
}
