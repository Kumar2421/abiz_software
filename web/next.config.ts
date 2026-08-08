import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Static export: every route in this app is client-rendered behind a session
   * cookie, and the API is a separate Express service, so there is nothing for
   * a Next server to do at runtime.
   *
   * It also side-steps a Next 16 bug where prerendering the built-in
   * /_global-error page throws "Cannot read properties of null (reading
   * 'useContext')" and fails the build (vercel/next.js#86178).
   */
  output: "export",

  // Emits /login/index.html rather than /login.html, which static hosts serve
  // at both /login and /login/ without extra redirect rules.
  trailingSlash: true,

  // The export target has no image optimisation server.
  images: { unoptimized: true },
};

export default nextConfig;
