import { Router } from "express";
import { z } from "zod";

import { query, queryOne } from "../db/index.js";
import { requireAdmin, requireAuth } from "../lib/auth.js";
import { ApiError, asyncHandler, parseBody } from "../lib/http.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get(
  "/users",
  asyncHandler(async (_req, res) => {
    const users = await query(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.created_at,
              c.name AS company_name
         FROM users u
         JOIN companies c ON c.id = u.company_id
        ORDER BY u.created_at DESC`,
    );
    res.json({ users });
  }),
);

adminRouter.post(
  "/users/:id/status",
  asyncHandler(async (req, res) => {
    const { status } = parseBody(
      z.object({ status: z.enum(["active", "suspended"]) }),
      req.body,
    );

    if (req.params.id === req.user!.id) {
      throw ApiError.badRequest("You cannot change your own status");
    }

    const row = await queryOne<{ id: string }>(
      `UPDATE users SET status = $2 WHERE id = $1 RETURNING id`,
      [req.params.id, status],
    );
    if (!row) throw ApiError.notFound("User not found");

    res.json({ ok: true });
  }),
);

adminRouter.delete(
  "/users/:id",
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) {
      throw ApiError.badRequest("You cannot delete your own account");
    }
    const row = await queryOne<{ id: string }>(
      `DELETE FROM users WHERE id = $1 RETURNING id`,
      [req.params.id],
    );
    if (!row) throw ApiError.notFound("User not found");
    res.json({ ok: true });
  }),
);

adminRouter.get(
  "/whatsapp-accounts",
  asyncHandler(async (_req, res) => {
    const accounts = await query(
      `SELECT w.company_id, c.name AS company_name, w.display_number,
              w.phone_number_id, w.status, w.updated_at
         FROM whatsapp_accounts w
         JOIN companies c ON c.id = w.company_id
        ORDER BY w.updated_at DESC`,
    );
    res.json({ accounts });
  }),
);

adminRouter.get(
  "/webhook-logs",
  asyncHandler(async (_req, res) => {
    const logs = await query(
      `SELECT id, company_id, event_type, payload, error, created_at
         FROM webhook_logs
        ORDER BY created_at DESC
        LIMIT 200`,
    );
    res.json({ logs });
  }),
);
