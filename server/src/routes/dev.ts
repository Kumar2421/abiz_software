import { Router } from "express";
import { z } from "zod";

import { env } from "../env.js";
import { requireAuth } from "../lib/auth.js";
import { ApiError, asyncHandler, parseBody } from "../lib/http.js";
import { applyStatusUpdate, receiveMessage } from "../services/messaging.js";
import { query } from "../db/index.js";

export const devRouter = Router();
devRouter.use(requireAuth);

devRouter.use((_req, _res, next) => {
  if (env.NODE_ENV === "production" && env.WHATSAPP_DRIVER === "cloud") {
    next(ApiError.forbidden("Simulation is disabled on the live Cloud API"));
    return;
  }
  next();
});

/**
 * Plays the customer's side: delivers an inbound message to your own inbox.
 *
 * With WHATSAPP_DRIVER=mock nothing is sent to a real phone, so this is the
 * only way an incoming message can appear. It also exercises the auto-welcome,
 * unread badge, and realtime path exactly as a real webhook would.
 */
devRouter.post(
  "/inbound",
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        phone: z.string().trim().min(6).max(25),
        body: z.string().trim().min(1).max(4096),
        name: z.string().trim().max(120).optional(),
      }),
      req.body,
    );

    const message = await receiveMessage({
      companyId: req.user!.companyId,
      fromPhone: input.phone,
      body: input.body,
      profileName: input.name,
    });

    res.status(201).json({ message });
  }),
);

/** Moves an outbound message along the sent -> delivered -> read ladder. */
devRouter.post(
  "/status",
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        messageId: z.uuid(),
        status: z.enum(["sent", "delivered", "read", "failed"]),
      }),
      req.body,
    );

    const rows = await query<{ wa_message_id: string | null }>(
      `SELECT wa_message_id FROM messages WHERE id = $1 AND company_id = $2`,
      [input.messageId, req.user!.companyId],
    );
    const waMessageId = rows[0]?.wa_message_id;
    if (!waMessageId) throw ApiError.notFound("Message not found");

    const message = await applyStatusUpdate(
      req.user!.companyId,
      waMessageId,
      input.status,
    );
    res.json({ message });
  }),
);
