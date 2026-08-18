import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { UPLOADS_DIR } from '../organizations/logo-upload.config';

/** Mirrors organizations/logo-upload.config.ts — a profile picture is just as non-sensitive/public a display image as an org logo, so it's served the same public-static way. */
const AVATARS_DIR = join(UPLOADS_DIR, 'avatars');

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

export const avatarUploadOptions: MulterOptions = {
  limits: { fileSize: MAX_AVATAR_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      callback(new BadRequestException('Avatar must be a PNG, JPEG, or WebP image.'), false);
      return;
    }
    callback(null, true);
  },
  storage: diskStorage({
    destination: AVATARS_DIR,
    filename: (_req, file, callback) => {
      const ext = ALLOWED_MIME_TYPES[file.mimetype] ?? extname(file.originalname) ?? '';
      callback(null, `${randomUUID()}${ext}`);
    },
  }),
};

export function avatarPublicPath(filename: string): string {
  return `/uploads/avatars/${filename}`;
}
