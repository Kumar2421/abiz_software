import { createHash, randomBytes } from "node:crypto";

import { Router } from "express";
import { z } from "zod";

import { getDb, query, queryOne } from "../db/index.js";
import { clientOrigins, env } from "../env.js";
import {
  clearAuthCookie,
  hashPassword,
  requireAuth,
  setAuthCookie,
  signToken,
  verifyPassword,
} from "../lib/auth.js";
import { ApiError, asyncHandler, parseBody } from "../lib/http.js";

export const authRouter = Router();

const DEFAULT_WELCOME = `Hi 👋

Thank you for contacting {{company_name}}. Contact {{phone}} if you need more details.

We have received your message and will reply as soon as possible.`;

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email(),
  password: z.string().min(8).max(200),
  companyName: z.string().trim().min(2).max(120).optional(),
});

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = parseBody(registerSchema, req.body);

    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = lower($1)`,
      [input.email],
    );
    if (existing) throw ApiError.conflict("That email is already registered");

    const passwordHash = await hashPassword(input.password);
    const db = await getDb();

    const user = await db.transaction(async (tx) => {
      const [company] = await tx.query<{ id: string }>(
        `INSERT INTO companies (name) VALUES ($1) RETURNING id`,
        [input.companyName?.trim() || `${input.name}'s business`],
      );

      const [created] = await tx.query<{
        id: string;
        company_id: string;
        name: string;
        email: string;
        role: "owner" | "admin";
      }>(
        `INSERT INTO users (company_id, name, email, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, company_id, name, email, role`,
        [company!.id, input.name, input.email.toLowerCase(), passwordHash],
      );

      // Every company starts with an empty connection record and a welcome
      // message, so Settings has something to edit from the first login.
      await tx.query(
        `INSERT INTO whatsapp_accounts (company_id) VALUES ($1)`,
        [company!.id],
      );
      await tx.query(
        `INSERT INTO welcome_messages (company_id, body) VALUES ($1, $2)`,
        [company!.id, DEFAULT_WELCOME],
      );

      // Free trial starts the moment the account exists.
      await tx.query(
        `INSERT INTO subscriptions (company_id, status, trial_ends_at)
         VALUES ($1, 'TRIAL', now() + ($2 || ' days')::interval)
         ON CONFLICT (company_id) DO NOTHING`,
        [company!.id, String(env.TRIAL_DAYS)],
      );

      return created!;
    });

    setAuthCookie(res, signToken({ id: user.id, companyId: user.company_id }));
    res.status(201).json({
      user: {
        id: user.id,
        companyId: user.company_id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  }),
);

// Accepts an email or a bare username. The seeded local admin signs in as
// "admin", which is not a valid email address.
const loginSchema = z.object({
  email: z.string().trim().min(1).max(200),
  password: z.string().min(1),
});

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = parseBody(loginSchema, req.body);

    const row = await queryOne<{
      id: string;
      company_id: string;
      name: string;
      email: string;
      role: "owner" | "admin";
      status: "active" | "suspended";
      password_hash: string;
    }>(
      `SELECT id, company_id, name, email, role, status, password_hash
         FROM users WHERE lower(email) = lower($1)`,
      [input.email],
    );

    // Same message for unknown email and wrong password — do not leak which
    // addresses have accounts.
    const invalid = ApiError.unauthorized("Invalid email or password");
    if (!row) throw invalid;
    if (!(await verifyPassword(input.password, row.password_hash))) throw invalid;
    if (row.status === "suspended") {
      throw ApiError.forbidden("This account has been suspended");
    }

    setAuthCookie(res, signToken({ id: row.id, companyId: row.company_id }));
    res.json({
      user: {
        id: row.id,
        companyId: row.company_id,
        name: row.name,
        email: row.email,
        role: row.role,
      },
    });
  }),
);

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const company = await queryOne<{ name: string; address: string | null }>(
      `SELECT name, address FROM companies WHERE id = $1`,
      [req.user!.companyId],
    );
    res.json({
      user: req.user,
      company: { name: company?.name ?? "", address: company?.address ?? "" },
    });
  }),
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = parseBody(changePasswordSchema, req.body);

    const row = await queryOne<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [req.user!.id],
    );
    if (!row || !(await verifyPassword(input.currentPassword, row.password_hash))) {
      throw ApiError.badRequest("Current password is incorrect");
    }

    await queryOne(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
      req.user!.id,
      await hashPassword(input.newPassword),
    ]);

    res.json({ ok: true });
  }),
);

/** Only the hash is stored, so the table alone cannot reset any password. */
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

authRouter.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = parseBody(
      z.object({ email: z.string().trim().min(1).max(200) }),
      req.body,
    );

    const user = await queryOne<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = lower($1) AND status = 'active'`,
      [email],
    );

    // Always answer the same way: revealing which addresses have accounts is
    // an enumeration hole.
    const message = "If that account exists, a reset link has been sent.";

    if (!user) {
      res.json({ ok: true, message });
      return;
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + env.RESET_TOKEN_TTL_MINUTES * 60_000,
    );

    // Any older link for this user stops working the moment a new one is made.
    await query(
      `UPDATE password_resets SET used_at = now()
        WHERE user_id = $1 AND used_at IS NULL`,
      [user.id],
    );
    await query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, hashToken(token), expiresAt.toISOString()],
    );

    const resetUrl = `${clientOrigins[0]}/reset-password?token=${token}`;

    if (env.NODE_ENV === "production") {
      // Wire an email provider here. Never return the token in production.
      console.log(`[password-reset] send this link to ${email}: ${resetUrl}`);
      res.json({ ok: true, message });
      return;
    }

    // Development only: hand the link straight back so the flow is testable
    // without an email provider.
    res.json({
      ok: true,
      message,
      devResetUrl: resetUrl,
      expiresAt: expiresAt.toISOString(),
    });
  }),
);

authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        token: z.string().min(16),
        newPassword: z.string().min(8).max(200),
      }),
      req.body,
    );

    const row = await queryOne<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_resets
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [hashToken(input.token)],
    );

    if (!row) {
      throw ApiError.badRequest("This reset link is invalid or has expired");
    }

    const passwordHash = await hashPassword(input.newPassword);
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
        row.user_id,
        passwordHash,
      ]);
      await tx.query(
        `UPDATE password_resets SET used_at = now() WHERE id = $1`,
        [row.id],
      );
    });

    res.json({ ok: true });
  }),
);
