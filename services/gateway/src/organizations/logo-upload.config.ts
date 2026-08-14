import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

/** Uploaded logo files live under the gateway's own working directory, served back via `useStaticAssets` in main.ts. */
export const UPLOADS_DIR = join(process.cwd(), 'uploads');
const LOGOS_DIR = join(UPLOADS_DIR, 'logos');

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;

export const logoUploadOptions: MulterOptions = {
  limits: { fileSize: MAX_LOGO_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      callback(new BadRequestException('Logo must be a PNG, JPEG, or WebP image.'), false);
      return;
    }
    callback(null, true);
  },
  storage: diskStorage({
    destination: LOGOS_DIR,
    filename: (_req, file, callback) => {
      const ext = ALLOWED_MIME_TYPES[file.mimetype] ?? extname(file.originalname) ?? '';
      callback(null, `${randomUUID()}${ext}`);
    },
  }),
};

export function logoPublicPath(filename: string): string {
  return `/uploads/logos/${filename}`;
}
