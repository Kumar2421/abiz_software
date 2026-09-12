import { Router } from "express";

import { requireAuth } from "../lib/auth.js";
import { inboxLocked } from "../lib/subscription.js";
import { ApiError, asyncHandler } from "../lib/http.js";
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
    // A photo a customer sent is message content like any other, so it is
    // withheld from an unpaid account too. Without this the inbox could be
    // locked while the attachments behind it stayed readable by URL.
    const lock = await inboxLocked(req.user!);
    if (lock.locked) {
      throw new ApiError(
        402,
        "Complete payment to open your attachments.",
        "subscription_required",
        { status: lock.status },
      );
    }

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

    const stream = await openMedia(row);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  }),
);
