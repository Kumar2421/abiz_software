import { Router } from "express";
import { z } from "zod";

import { query, queryOne } from "../db/index.js";
import { requireAuth } from "../lib/auth.js";
import { ApiError, asyncHandler, parseBody, parseQuery } from "../lib/http.js";
import { isValidPhone, normalizePhone } from "../lib/phone.js";
import { getOrCreateConversation } from "../services/messaging.js";
import { toContact, type ContactRow } from "../services/shape.js";

export const contactsRouter = Router();
contactsRouter.use(requireAuth);

contactsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { search } = parseQuery(
      z.object({ search: z.string().optional() }),
      req.query,
    );

    const params: unknown[] = [req.user!.companyId];
    let filter = "";
    if (search?.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      filter = `AND (lower(name) LIKE $2 OR phone LIKE $2)`;
    }

    const rows = await query<ContactRow>(
      `SELECT * FROM contacts WHERE company_id = $1 ${filter} ORDER BY name ASC`,
      params,
    );
    res.json({ contacts: rows.map(toContact) });
  }),
);

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(25),
  notes: z.string().trim().max(2000).optional(),
});

contactsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = parseBody(contactSchema, req.body);
    if (!isValidPhone(input.phone)) {
      throw ApiError.badRequest("Enter a valid phone number with country code");
    }

    const phone = normalizePhone(input.phone);
    const clash = await queryOne<{ id: string }>(
      `SELECT id FROM contacts WHERE company_id = $1 AND phone = $2`,
      [req.user!.companyId, phone],
    );
    if (clash) throw ApiError.conflict("A contact with that number already exists");

    const row = await queryOne<ContactRow>(
      `INSERT INTO contacts (company_id, name, phone, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user!.companyId, input.name, phone, input.notes ?? null],
    );

    // A contact without a conversation cannot be messaged, so open one now.
    const conversation = await getOrCreateConversation(
      req.user!.companyId,
      row!.id,
    );

    res.status(201).json({
      contact: toContact(row!),
      conversationId: conversation.id,
    });
  }),
);

contactsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = parseBody(contactSchema.partial(), req.body);

    const existing = await queryOne<ContactRow>(
      `SELECT * FROM contacts WHERE company_id = $1 AND id = $2`,
      [req.user!.companyId, req.params.id],
    );
    if (!existing) throw ApiError.notFound("Contact not found");

    const phone = input.phone ? normalizePhone(input.phone) : existing.phone;
    if (input.phone && !isValidPhone(input.phone)) {
      throw ApiError.badRequest("Enter a valid phone number with country code");
    }

    const row = await queryOne<ContactRow>(
      `UPDATE contacts
          SET name = $3, phone = $4, notes = $5, updated_at = now()
        WHERE company_id = $1 AND id = $2
        RETURNING *`,
      [
        req.user!.companyId,
        req.params.id,
        input.name ?? existing.name,
        phone,
        input.notes ?? existing.notes,
      ],
    );

    res.json({ contact: toContact(row!) });
  }),
);

contactsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const removed = await queryOne<{ id: string }>(
      `DELETE FROM contacts WHERE company_id = $1 AND id = $2 RETURNING id`,
      [req.user!.companyId, req.params.id],
    );
    if (!removed) throw ApiError.notFound("Contact not found");
    res.json({ ok: true });
  }),
);
