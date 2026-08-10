import serverless from "serverless-http";

// Imports the compiled output, not src: the build runs `tsc` first, so the
// bundler never has to resolve TypeScript or NodeNext ".js" import specifiers.
import { app, ready } from "../../dist/app.js";

/**
 * Serves the whole Express API from one Netlify Function.
 *
 * netlify.toml rewrites /api/* and /health to this function, so the browser
 * talks to the same origin as the app: the session cookie stays first-party
 * (Safari blocks third-party cookies) and there is no CORS preflight.
 *
 * This is a Lambda-style ("v1") handler because that is the shape
 * serverless-http produces. Netlify's newer Request/Response signature would
 * need a separate adapter.
 */

const FUNCTION_PREFIX = "/.netlify/functions/api";

const wrapped = serverless(app);

export const handler = async (event, context) => {
  // Applies pending migrations once per cold start; a no-op when warm.
  await ready();

  // Netlify reports the rewritten path, which still carries the function
  // prefix. Express only knows routes like /api/auth/login, so strip it.
  const path = event.path ?? "/";
  const routed = path.startsWith(FUNCTION_PREFIX)
    ? path.slice(FUNCTION_PREFIX.length) || "/"
    : path;

  return wrapped({ ...event, path: routed }, context);
};
