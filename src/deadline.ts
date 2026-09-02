export function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error(message));
  }

  return new Promise<T>((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(new Error(message));
    }, timeoutMs);
    promise.then(
      (value) => {
        if (!expired) {
          clearTimeout(timer);
          resolve(value);
        }
      },
      (error: unknown) => {
        if (!expired) {
          clearTimeout(timer);
          reject(error);
        }
      },
    );
  });
}
