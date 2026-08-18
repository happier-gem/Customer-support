import { BadRequestException } from '@nestjs/common';
import { avatarPublicPath, avatarUploadOptions } from './avatar-upload.config';

function runFileFilter(mimetype: string): { accepted: boolean; error?: Error } {
  let accepted = false;
  let error: Error | undefined;
  const fileFilter = avatarUploadOptions.fileFilter!;
  fileFilter({} as never, { mimetype } as never, (err, ok) => {
    error = err ?? undefined;
    accepted = Boolean(ok);
  });
  return { accepted, error };
}

describe('avatar-upload.config', () => {
  describe('fileFilter (MIME type validation)', () => {
    it.each(['image/png', 'image/jpeg', 'image/webp'])('accepts allowed MIME type %s', (mimetype) => {
      const { accepted, error } = runFileFilter(mimetype);
      expect(accepted).toBe(true);
      expect(error).toBeUndefined();
    });

    it.each(['application/x-msdownload', 'text/html', 'application/pdf', 'image/svg+xml'])(
      'rejects unsupported/dangerous MIME type %s',
      (mimetype) => {
        const { accepted, error } = runFileFilter(mimetype);
        expect(accepted).toBe(false);
        expect(error).toBeInstanceOf(BadRequestException);
      },
    );

    it('enforces a maximum file size limit', () => {
      expect(avatarUploadOptions.limits?.fileSize).toBe(2 * 1024 * 1024);
    });
  });

  describe('avatarPublicPath', () => {
    it('builds a path under the public /uploads/avatars/ prefix', () => {
      expect(avatarPublicPath('abc.png')).toBe('/uploads/avatars/abc.png');
    });
  });
});
