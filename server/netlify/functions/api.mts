import serverless from "serverless-http";

import { app, ready } from "../../src/app.js";

/**
 * Serves the whole Express API from one Netlify Function.
 *
 * `netlify.toml` rewrites /api/* and /health here, so the browser talks to the
 * same origin as the app — the session cookie stays first-party and no CORS
 * preflight is involved.
 */

const handler = serverless(app);

export default async (request: Request, context: unknown) => {
  // Applies pending migrations once per cold start; a no-op afterwards.
  await ready();
  return handler(request, context) as unknown as Response;
};

export const config = {
  path: ["/api/*", "/health"],
};
