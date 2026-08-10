import serverless from "serverless-http";

// Imports compiled output, not src: the build runs `tsc` first, so the bundler
// never has to resolve TypeScript or NodeNext ".js" import specifiers.
import { app, ready } from "../../dist/app.js";

/**
 * Serves the whole Express API from one Netlify Function.
 *
 * Uses Netlify's native (Request -> Response) signature with a default export.
 * The Lambda-style `export const handler` form makes Netlify emit a CommonJS
 * wrapper that `require()`s this ESM file, which fails with ERR_REQUIRE_ESM.
 *
 * serverless-http still speaks the Lambda event shape, so the Request is
 * translated into one here and its result translated back.
 *
 * Routing lives in `export const config` below, so the original path reaches
 * Express unchanged — no rewrite prefix to strip.
 */

const toLambdaEvent = async (request) => {
  const url = new URL(request.url);
  const hasBody = !["GET", "HEAD"].includes(request.method);

  // Express needs the raw bytes for the Razorpay webhook signature, and
  // base64 keeps binary uploads intact.
  const raw = hasBody ? Buffer.from(await request.arrayBuffer()) : null;

  const queryStringParameters = {};
  for (const [key, value] of url.searchParams) queryStringParameters[key] = value;

  return {
    path: url.pathname,
    httpMethod: request.method,
    headers: Object.fromEntries(request.headers),
    queryStringParameters,
    body: raw ? raw.toString("base64") : null,
    isBase64Encoded: Boolean(raw),
  };
};

const toResponse = (result) => {
  const headers = new Headers();

  for (const [key, value] of Object.entries(result.headers ?? {})) {
    if (value !== undefined) headers.set(key, String(value));
  }

  // Several Set-Cookie headers only survive as separate entries.
  for (const [key, values] of Object.entries(result.multiValueHeaders ?? {})) {
    if (!Array.isArray(values)) continue;
    headers.delete(key);
    for (const value of values) headers.append(key, String(value));
  }

  const body = result.isBase64Encoded
    ? Buffer.from(result.body ?? "", "base64")
    : (result.body ?? "");

  return new Response(body, { status: result.statusCode ?? 200, headers });
};

const wrapped = serverless(app, { binary: true });

export default async (request) => {
  // Applies pending migrations once per cold start; a no-op when warm.
  await ready();

  const result = await wrapped(await toLambdaEvent(request), {});
  return toResponse(result);
};

export const config = {
  path: ["/api/*", "/health"],
};
