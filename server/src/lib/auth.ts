import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../env.js";
import { queryOne } from "../db/index.js";
import { ApiError } from "./http.js";

export const TOKEN_COOKIE = "abiz_token";
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface AuthUser {
  id: string;
  companyId: string;
  email: string;
  name: string;
  role: "owner" | "admin";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(user: { id: string; companyId: string }): string {
  return jwt.sign({ sub: user.id, cid: user.companyId }, env.JWT_SECRET, {
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    secure: env.NODE_ENV === "production",
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(TOKEN_COOKIE, { path: "/" });
}

interface UserRow {
  id: string;
  company_id: string;
  email: string;
  name: string;
  role: "owner" | "admin";
  status: "active" | "suspended";
}

/** Resolves a raw JWT to a live, non-suspended user. */
export async function userFromToken(token: string): Promise<AuthUser> {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
  } catch {
    throw ApiError.unauthorized("Session expired, sign in again");
  }

  const row = await queryOne<UserRow>(
    `SELECT id, company_id, email, name, role, status FROM users WHERE id = $1`,
    [payload.sub],
  );

  if (!row) throw ApiError.unauthorized("Account no longer exists");
  if (row.status === "suspended") {
    throw ApiError.forbidden("Account suspended");
  }

  return {
    id: row.id,
    companyId: row.company_id,
    email: row.email,
    name: row.name,
    role: row.role,
  };
}

function readToken(req: Request): string | null {
  const cookie = (req.cookies as Record<string, string> | undefined)?.[
    TOKEN_COOKIE
  ];
  if (cookie) return cookie;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);

  return null;
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = readToken(req);
    if (!token) throw ApiError.unauthorized();
    req.user = await userFromToken(token);
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (req.user?.role !== "admin") {
    next(ApiError.forbidden("Admin access required"));
    return;
  }
  next();
}
