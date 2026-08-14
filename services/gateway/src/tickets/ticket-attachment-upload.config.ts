import { randomUUID } from 'crypto';
import { join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

/**
 * Deliberately NOT under the gateway's public `/uploads/` static prefix
 * (see main.ts's `useStaticAssets`) — ticket attachments are tenant-private,
 * unlike org logos, so they can only be read back through the authenticated,
 * tenant-scoped download route in tickets.controller.ts.
 */
export const TICKET_ATTACHMENTS_DIR = join(process.cwd(), 'uploads', 'ticket-attachments');

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
};

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

export const ticketAttachmentUploadOptions: MulterOptions = {
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      callback(new BadRequestException('Unsupported file type. Allowed: PNG, JPEG, WebP, PDF, TXT, CSV.'), false);
      return;
    }
    callback(null, true);
  },
  storage: diskStorage({
    destination: TICKET_ATTACHMENTS_DIR,
    // The name written to disk is always server-generated from an allow-listed
    // extension — the client-supplied original filename/extension is never
    // trusted for the filesystem path, which also rules out path traversal.
    filename: (_req, file, callback) => {
      const ext = ALLOWED_MIME_TYPES[file.mimetype] ?? '';
      callback(null, `${randomUUID()}${ext}`);
    },
  }),
};

/** Trims a client-supplied filename to a safe, display-only value (never used as a filesystem path). */
export function sanitizeDisplayFileName(originalName: string): string {
  const stripped = originalName.replace(/[/\\]/g, '_').trim();
  return stripped.slice(0, 255) || 'attachment';
}
