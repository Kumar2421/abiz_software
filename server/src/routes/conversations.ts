import { Router } from "express";
import multer from "multer";
import { z } from "zod";

import { requireAuth } from "../lib/auth.js";
import { asyncHandler, parseBody, parseQuery } from "../lib/http.js";
import { isValidPhone } from "../lib/phone.js";
import { ApiError } from "../lib/http.js";
import {
  getOrCreateConversation,
  listConversations,
  listMessages,
  markConversationRead,
  requireConversation,
  sendMediaMessage,
  sendMessage,
  sendWindow,
  setArchived,
  upsertContact,
} from "../services/messaging.js";
import { MEDIA_LIMITS } from "../services/media.js";
import { toConversation } from "../services/shape.js";

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

// Held in memory, then written to disk by the media service. The cap is the
// largest WhatsApp allows for any type; per-type limits are enforced there.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MEDIA_LIMITS.document, files: 1 },
});

conversationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { folder, search } = parseQuery(
      z.object({
        folder: z.enum(["all", "unread", "archived"]).default("all"),
        search: z.string().optional(),
      }),
      req.query,
    );

    res.json({
      conversations: await listConversations(req.user!.companyId, {
        folder,
        search,
      }),
    });
  }),
);

/** Start (or reuse) a conversation with any phone number - direct messaging. */
conversationsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = parseBody(
      z.object({
        phone: z.string().trim().min(6).max(25),
        name: z.string().trim().max(120).optional(),
      }),
      req.body,
    );

    if (!isValidPhone(input.phone)) {
      throw ApiError.badRequest("Enter a valid phone number with country code");
    }

    const contact = await upsertContact(
      req.user!.companyId,
      input.phone,
      input.name,
    );
    const row = await getOrCreateConversation(req.user!.companyId, contact.id);

    res.status(201).json({ conversation: toConversation(row) });
  }),
);

conversationsRouter.get(
  "/:id/messages",
  asyncHandler(async (req, res) => {
    const row = await requireConversation(req.user!.companyId, String(req.params.id));
    const messages = await listMessages(req.user!.companyId, String(req.params.id));
    const window = sendWindow(row);

    res.json({
      conversation: toConversation(row),
      messages,
      sendWindow: { open: window.open, msLeft: window.msLeft },
    });
  }),
);

conversationsRouter.post(
  "/:id/messages",
  asyncHandler(async (req, res) => {
    const { body } = parseBody(
      z.object({ body: z.string().trim().min(1).max(4096) }),
      req.body,
    );

    const message = await sendMessage(
      req.user!.companyId,
      String(req.params.id),
      body,
    );
    res.status(201).json({ message });
  }),
);

/** Attachment upload: one file plus an optional caption. */
conversationsRouter.post(
  "/:id/media",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw ApiError.badRequest("No file was uploaded");

    const message = await sendMediaMessage({
      companyId: req.user!.companyId,
      conversationId: String(req.params.id),
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      caption:
        typeof req.body?.caption === "string" ? req.body.caption : undefined,
    });

    res.status(201).json({ message });
  }),
);

conversationsRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    res.json({
      conversation: await markConversationRead(
        req.user!.companyId,
        String(req.params.id),
      ),
    });
  }),
);

conversationsRouter.post(
  "/:id/archive",
  asyncHandler(async (req, res) => {
    const { archived } = parseBody(
      z.object({ archived: z.boolean().default(true) }),
      req.body ?? {},
    );
    res.json({
      conversation: await setArchived(
        req.user!.companyId,
        String(req.params.id),
        archived,
      ),
    });
  }),
);
