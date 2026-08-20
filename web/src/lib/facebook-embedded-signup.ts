"use client";

/**
 * Loads the Facebook JS SDK once and drives Embedded Signup.
 *
 * Kept separate from lib/api.ts (server calls) and components/settings —
 * this file's only job is the Meta-SDK-specific plumbing: script injection,
 * FB.init, FB.login, and parsing the message event Embedded Signup posts
 * back with the WABA id and phone number id. Everything after that (storing
 * credentials, checking the connection) goes through the normal api client.
 */

import * as React from "react";

declare global {
  interface Window {
    FB?: {
      init: (params: {
        appId: string;
        autoLogAppEvents?: boolean;
        xfbml?: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: FacebookLoginResponse) => void,
        params: {
          config_id: string;
          response_type: "code";
          override_default_response_type: true;
          extras?: { setup?: Record<string, unknown> };
        },
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

interface FacebookLoginResponse {
  authResponse?: { code?: string } | null;
  status?: string;
}

/** Meta posts this shape via window.postMessage during Embedded Signup. */
interface EmbeddedSignupMessage {
  type: "WA_EMBEDDED_SIGNUP";
  event: "FINISH" | "CANCEL" | "ERROR";
  data?: {
    phone_number_id?: string;
    waba_id?: string;
    business_id?: string;
  };
}

function isEmbeddedSignupMessage(value: unknown): value is EmbeddedSignupMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "WA_EMBEDDED_SIGNUP"
  );
}

let sdkLoadPromise: Promise<void> | null = null;

/** Injects the Facebook JS SDK script exactly once, however many components mount. */
function loadFacebookSdk(appId: string, graphVersion: string): Promise<void> {
  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise((resolve) => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion });
      resolve();
    };

    if (document.getElementById("facebook-jssdk")) {
      // Script tag already present from a previous mount; fbAsyncInit above
      // will still fire once the SDK finishes loading.
      return;
    }

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  });

  return sdkLoadPromise;
}

export interface EmbeddedSignupResult {
  wabaId: string;
  phoneNumberId: string;
  businessId?: string;
  code: string;
}

interface UseFacebookLoginParams {
  appId: string;
  configId: string;
  graphVersion?: string;
}

/**
 * Returns a `connect()` function that runs the full Embedded Signup dance
 * and resolves with everything the callback route needs. Throws on cancel,
 * error, or timeout so callers can show it as a normal failed action.
 */
export function useFacebookLogin({
  appId,
  configId,
  graphVersion = "v21.0",
}: UseFacebookLoginParams) {
  const connect = React.useCallback((): Promise<EmbeddedSignupResult> => {
    return new Promise((resolve, reject) => {
      let settled = false;
      let signupData: EmbeddedSignupMessage["data"] | undefined;

      const onMessage = (event: MessageEvent) => {
        // Meta's docs specify checking the origin; both domains are used
        // across rollouts, so accept either rather than hardcoding one.
        if (
          event.origin !== "https://www.facebook.com" &&
          event.origin !== "https://web.facebook.com"
        ) {
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!isEmbeddedSignupMessage(parsed)) return;

        if (parsed.event === "FINISH") {
          signupData = parsed.data;
        } else if (parsed.event === "CANCEL") {
          finish(() => reject(new Error("Connection cancelled")));
        } else if (parsed.event === "ERROR") {
          finish(() =>
            reject(new Error("Meta reported an error during signup. Try again.")),
          );
        }
      };

      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", onMessage);
        action();
      };

      window.addEventListener("message", onMessage);

      loadFacebookSdk(appId, graphVersion)
        .then(() => {
          window.FB?.login(
            (response) => {
              const code = response.authResponse?.code;
              if (!code) {
                finish(() =>
                  reject(new Error("Facebook did not return an authorization code")),
                );
                return;
              }
              if (!signupData?.waba_id || !signupData?.phone_number_id) {
                finish(() =>
                  reject(
                    new Error(
                      "Facebook approved the login but did not confirm a WhatsApp account. Try again.",
                    ),
                  ),
                );
                return;
              }
              finish(() =>
                resolve({
                  code,
                  wabaId: signupData!.waba_id!,
                  phoneNumberId: signupData!.phone_number_id!,
                  businessId: signupData!.business_id,
                }),
              );
            },
            {
              config_id: configId,
              response_type: "code",
              override_default_response_type: true,
              extras: { setup: {} },
            },
          );
        })
        .catch(() => finish(() => reject(new Error("Could not load Facebook's login SDK"))));
    });
  }, [appId, configId, graphVersion]);

  return { connect };
}
