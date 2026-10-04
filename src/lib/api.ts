/** Browser-side helper for the app's own JSON API. */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "POST" | "DELETE";
  signal?: AbortSignal;
  /** Extra attempts on network failures and 5xx/429. Only for idempotent calls. */
  retries?: number;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function api<T = unknown>(
  path: string,
  body?: unknown,
  { method = "POST", signal, retries = 0 }: RequestOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const retry = attempt < retries;
    let response: Response;
    try {
      response = await fetch(path, {
        method,
        signal,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      if (signal?.aborted || !retry) throw error;
      await wait(500 * 2 ** attempt);
      continue;
    }

    if (response.ok) {
      return (response.status === 204 ? undefined : await response.json()) as T;
    }
    if (retry && (response.status >= 500 || response.status === 429)) {
      await wait(500 * 2 ** attempt);
      continue;
    }

    const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
    throw new ApiError(payload?.error ?? "Something went wrong. Try again.", response.status, payload?.code);
  }
}

export function errorMessage(error: unknown, fallback = "Something went wrong. Try again."): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof TypeError) return "Network error. Check your connection and try again.";
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
