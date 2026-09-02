export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = "Operation timed out",
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error("timeoutMs must be a positive number"));
  }

  return new Promise<T>((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        if (!timedOut) {
          clearTimeout(timer);
          resolve(value);
        }
      },
      (error: unknown) => {
        if (!timedOut) {
          clearTimeout(timer);
          reject(error);
        }
      },
    );
  });
}
