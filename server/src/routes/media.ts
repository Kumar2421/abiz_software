import { Router } from "express";

import { requireAuth } from "../lib/auth.js";
import { asyncHandler } from "../lib/http.js";
import { findMedia, openMedia } from "../services/media.js";

export const mediaRouter = Router();
mediaRouter.use(requireAuth);

/**
 * Streams an attachment. Scoped to the caller's company, so a media id from
 * another tenant resolves to 404 rather than leaking the file.
 */
mediaRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = await findMedia(req.user!.companyId, String(req.params.id));
    const inline = req.query.download === undefined;

    res.setHeader("Content-Type", row.mime_type);
    res.setHeader("Content-Length", String(row.size_bytes));
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(row.file_name)}"`,
    );
    // Private: the response depends on the session cookie.
    res.setHeader("Cache-Control", "private, max-age=86400");

    openMedia(row).pipe(res);
  }),
);
