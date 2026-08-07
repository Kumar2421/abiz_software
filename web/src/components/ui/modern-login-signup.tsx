"use client";

import * as React from "react";
import * as THREE from "three";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Animated dot-matrix background                                      */
/* ------------------------------------------------------------------ */

const VERTEX_SHADER = /* glsl */ `
  precision mediump float;
  uniform vec2 u_resolution;
  out vec2 fragCoord;
  void main() {
    gl_Position = vec4(position, 1.0);
    fragCoord = (position.xy + 1.0) * 0.5 * u_resolution;
    fragCoord.y = u_resolution.y - fragCoord.y;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  in vec2 fragCoord;

  uniform float u_time;
  uniform float u_opacities[10];
  uniform vec3 u_colors[6];
  uniform float u_total_size;
  uniform float u_dot_size;
  uniform vec2 u_resolution;

  out vec4 fragColor;

  float PHI = 1.61803398874989484820459;
  float random(vec2 xy) {
      return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
  }

  void main() {
      vec2 st = fragCoord.xy;
      st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));
      st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));

      float opacity = step(0.0, st.x) * step(0.0, st.y);

      vec2 st2 = vec2(int(st.x / u_total_size), int(st.y / u_total_size));

      float frequency = 5.0;
      float show_offset = random(st2);
      float rand = random(st2 * floor((u_time / frequency) + show_offset + frequency));
      opacity *= u_opacities[int(rand * 10.0)];
      opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
      opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));

      vec3 color = u_colors[int(show_offset * 6.0)];

      float animation_speed_factor = 3.0;
      vec2 center_grid = u_resolution / 2.0 / u_total_size;
      float dist_from_center = distance(center_grid, st2);
      float timing_offset = dist_from_center * 0.01 + (random(st2) * 0.15);

      opacity *= step(timing_offset, u_time * animation_speed_factor);
      opacity *= clamp((1.0 - step(timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);

      fragColor = vec4(color, opacity);
      fragColor.rgb *= fragColor.a;
  }
`;

function DotMatrixCanvas({ className }: { className?: string }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Respect reduced-motion: render nothing rather than a looping animation.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
      });
    } catch {
      return; // No WebGL — the card still renders over a plain background.
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const white = () => new THREE.Vector3(1, 1, 1);

    const uniforms = {
      u_time: { value: 0 },
      u_resolution: {
        value: new THREE.Vector2(window.innerWidth * 2, window.innerHeight * 2),
      },
      u_opacities: {
        value: [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1.0],
      },
      u_colors: {
        value: [white(), white(), white(), white(), white(), white()],
      },
      u_total_size: { value: 20.0 },
      u_dot_size: { value: 6.0 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      glslVersion: THREE.GLSL3,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      transparent: true,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));

    const startTime = performance.now();
    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      uniforms.u_time.value = (performance.now() - startTime) / 1000;
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      uniforms.u_resolution.value.set(
        window.innerWidth * 2,
        window.innerHeight * 2,
      );
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} />;
}

/* ------------------------------------------------------------------ */
/* Brand marks (lucide-react ships no brand logos)                     */
/* ------------------------------------------------------------------ */

const GoogleIcon = (
  <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden>
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const AppleIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className="size-4 shrink-0"
    aria-hidden
  >
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.04 2.26-.79 3.59-.76 1.56.04 2.88.75 3.65 1.89-3.08 1.75-2.58 5.61.35 6.75-1.01 2.37-2.39 4.39-4.29 4.29zM12.03 7.25c-.15-2.23 1.66-4.07 3.72-4.25.36 2.38-1.92 4.34-3.72 4.25z" />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Auth card                                                           */
/* ------------------------------------------------------------------ */

export type AuthMode = "login" | "signup";

export interface AuthFormValues {
  name?: string;
  companyName?: string;
  email: string;
  password: string;
}

export interface ModernLoginSignupProps {
  /** Uncontrolled starting mode. */
  defaultMode?: AuthMode;
  /** Controlled mode — pass together with `onModeChange`. */
  mode?: AuthMode;
  onModeChange?: (mode: AuthMode) => void;
  onSubmit?: (mode: AuthMode, values: AuthFormValues) => void | Promise<void>;
  onSocial?: (provider: "google" | "apple") => void;
  /** Receives whatever is currently typed in the email field. */
  onForgotPassword?: (email: string) => void;
  brandName?: string;
  brandInitials?: string;
  className?: string;
}

export function ModernLoginSignup({
  defaultMode = "login",
  mode: controlledMode,
  onModeChange,
  onSubmit,
  onSocial,
  onForgotPassword,
  brandName = "Abiz",
  brandInitials = "AB",
  className,
}: ModernLoginSignupProps) {
  const [uncontrolledMode, setUncontrolledMode] =
    React.useState<AuthMode>(defaultMode);
  const [pending, setPending] = React.useState(false);
  const [email, setEmail] = React.useState("");

  const mode = controlledMode ?? uncontrolledMode;
  const isLogin = mode === "login";

  const setMode = (next: AuthMode) => {
    if (controlledMode === undefined) setUncontrolledMode(next);
    onModeChange?.(next);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values: AuthFormValues = {
      name: (data.get("name") as string) || undefined,
      companyName: (data.get("companyName") as string) || undefined,
      email: data.get("email") as string,
      password: data.get("password") as string,
    };
    try {
      setPending(true);
      await onSubmit?.(mode, values);
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className={cn(
        "relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-black px-4 py-10 text-white",
        className,
      )}
    >
      <DotMatrixCanvas className="pointer-events-none absolute inset-0 z-0 size-full" />

      {/* Vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(circle at center, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)",
        }}
      />

      <div className="relative z-[2] w-full max-w-100 rounded-xl border border-white/10 bg-neutral-950 p-8 shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex size-11 items-center justify-center rounded-full border border-white/15 bg-neutral-900 text-lg font-bold">
            {brandInitials}
          </div>

          <h1 className="text-xl font-semibold tracking-tight">
            {isLogin ? `Sign in to ${brandName}` : `Create your ${brandName} account`}
          </h1>
          <p className="mt-1 mb-4 text-sm text-neutral-400">
            {isLogin
              ? "Manage your WhatsApp inbox in one place."
              : "Connect your WhatsApp Business number in minutes."}
          </p>

          <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2.5">
            {!isLogin && (
              <>
                <Input
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Full name"
                  required
                  className="border-white/15 bg-black text-white placeholder:text-neutral-500"
                />
                <Input
                  name="companyName"
                  type="text"
                  autoComplete="organization"
                  placeholder="Business name"
                  className="border-white/15 bg-black text-white placeholder:text-neutral-500"
                />
              </>
            )}
            <Input
              name="email"
              // Login accepts a username too, so no type="email" validation here.
              type={isLogin ? "text" : "email"}
              autoComplete={isLogin ? "username" : "email"}
              placeholder={
                isLogin ? "Email or username" : "name@work-email.com"
              }
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="border-white/15 bg-black text-white placeholder:text-neutral-500"
            />
            <Input
              name="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder="Password"
              minLength={8}
              required
              className="border-white/15 bg-black text-white placeholder:text-neutral-500"
            />

            {isLogin && (
              <button
                type="button"
                onClick={() => onForgotPassword?.(email)}
                disabled={!email.trim()}
                title={
                  email.trim() ? undefined : "Enter your email address first"
                }
                className="-mt-0.5 self-end text-xs text-neutral-400 hover:text-white disabled:opacity-50"
              >
                Forgot password?
              </button>
            )}

            <Button
              type="submit"
              disabled={pending}
              className="w-full bg-neutral-100 text-black hover:bg-white"
            >
              {pending ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="my-4 h-px w-full bg-white/10" />

          <Button
            type="button"
            variant="outline"
            onClick={() => onSocial?.("google")}
            className="mb-1.5 w-full border-white/15 bg-transparent text-white hover:bg-white/5 hover:text-white"
          >
            {GoogleIcon}
            Continue with Google
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onSocial?.("apple")}
            className="w-full border-white/15 bg-transparent text-white hover:bg-white/5 hover:text-white"
          >
            {AppleIcon}
            Continue with Apple
          </Button>

          <p className="mt-5 text-sm text-neutral-400">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => setMode(isLogin ? "signup" : "login")}
              className="font-medium text-white underline-offset-4 hover:underline"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>

          <p className="mt-3 text-xs leading-relaxed text-neutral-500">
            By continuing you agree to our{" "}
            <a href="#" className="text-neutral-400 hover:text-neutral-200">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="text-neutral-400 hover:text-neutral-200">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

export default ModernLoginSignup;
