import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "error",
    readonly details?: unknown,
  ) {
    super(message);
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, "bad_request", details);
  }
  static unauthorized(message = "Not authenticated") {
    return new ApiError(401, message, "unauthorized");
  }
  static forbidden(message = "Not allowed") {
    return new ApiError(403, message, "forbidden");
  }
  static notFound(message = "Not found") {
    return new ApiError(404, message, "not_found");
  }
  static conflict(message: string) {
    return new ApiError(409, message, "conflict");
  }
}

/** Wraps an async handler so rejected promises reach the error middleware. */
export function asyncHandler<
  T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
>(handler: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw ApiError.badRequest("Invalid request body", flatten(result.error));
  }
  return result.data;
}

export function parseQuery<T>(schema: ZodType<T>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw ApiError.badRequest("Invalid query parameters", flatten(result.error));
  }
  return result.data;
}

function flatten(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: error.code,
      message: error.message,
      details: error.details,
    });
    return;
  }

  console.error("Unhandled error:", error);
  res.status(500).json({ error: "internal", message: "Something went wrong" });
}
