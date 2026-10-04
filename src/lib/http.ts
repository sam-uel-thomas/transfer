import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";

import { getUploader, type Uploader } from "@/lib/auth";

/** An error whose message is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function jsonError(status: number, message: string, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

/** Parses and validates a JSON body, or throws a 400. */
export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(400, issue?.message ?? "Invalid request.");
  }
  return result.data;
}

/** Rejects cross-site requests to cookie-authenticated routes. */
function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return; // Same-origin GETs and non-browser clients omit it.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    // An opaque origin ("null") is never ours.
  }
  if (!originHost || originHost !== host) {
    throw new HttpError(403, "Cross-site request blocked.");
  }
}

/** For route handlers: the verified uploader, or a 401. */
export async function requireUploaderApi(request: Request): Promise<Uploader> {
  assertSameOrigin(request);
  const uploader = await getUploader();
  if (!uploader) throw new HttpError(401, "Sign in to continue.");
  return uploader;
}

/** Turns thrown errors into JSON responses and hides unexpected ones. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(error.status, error.message, error.code);
    }
    console.error(error);
    return jsonError(500, "Something went wrong. Try again.");
  }
}
