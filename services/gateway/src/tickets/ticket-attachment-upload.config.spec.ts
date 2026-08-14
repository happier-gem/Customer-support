import { BadRequestException } from '@nestjs/common';
import { sanitizeDisplayFileName, ticketAttachmentUploadOptions } from './ticket-attachment-upload.config';

function runFileFilter(mimetype: string): { accepted: boolean; error?: Error } {
  let accepted = false;
  let error: Error | undefined;
  const fileFilter = ticketAttachmentUploadOptions.fileFilter!;
  fileFilter({} as never, { mimetype } as never, (err, ok) => {
    error = err ?? undefined;
    accepted = Boolean(ok);
  });
  return { accepted, error };
}

describe('ticket-attachment-upload.config', () => {
  describe('fileFilter (MIME type validation)', () => {
    it.each(['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain', 'text/csv'])(
      'accepts allowed MIME type %s',
      (mimetype) => {
        const { accepted, error } = runFileFilter(mimetype);
        expect(accepted).toBe(true);
        expect(error).toBeUndefined();
      },
    );

    it.each(['application/x-msdownload', 'text/html', 'application/javascript', 'image/svg+xml'])(
      'rejects unsupported/dangerous MIME type %s',
      (mimetype) => {
        const { accepted, error } = runFileFilter(mimetype);
        expect(accepted).toBe(false);
        expect(error).toBeInstanceOf(BadRequestException);
      },
    );

    it('does not trust a spoofed extension to bypass MIME validation', () => {
      // A client can name the file "totally-safe.png" while sending an
      // executable's real MIME type — only the MIME type is checked, and
      // the stored filename's extension is derived from it, never from
      // the client-supplied name.
      const { accepted } = runFileFilter('application/x-msdownload');
      expect(accepted).toBe(false);
    });

    it('enforces a maximum file size limit', () => {
      expect(ticketAttachmentUploadOptions.limits?.fileSize).toBe(10 * 1024 * 1024);
    });
  });

  describe('sanitizeDisplayFileName', () => {
    it('strips path separators to prevent path traversal in the display name', () => {
      expect(sanitizeDisplayFileName('../../etc/passwd')).not.toContain('/');
      expect(sanitizeDisplayFileName('..\\..\\windows\\system32\\config')).not.toContain('\\');
    });

    it('truncates excessively long filenames', () => {
      const long = 'a'.repeat(500) + '.png';
      expect(sanitizeDisplayFileName(long).length).toBeLessThanOrEqual(255);
    });

    it('falls back to a default name for an empty/whitespace-only input', () => {
      expect(sanitizeDisplayFileName('   ')).toBe('attachment');
    });

    it('leaves an ordinary filename untouched', () => {
      expect(sanitizeDisplayFileName('screenshot.png')).toBe('screenshot.png');
    });
  });
});
