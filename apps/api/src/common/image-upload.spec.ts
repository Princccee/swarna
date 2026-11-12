import { BadRequestException } from '@nestjs/common';
import { imageUploadOptions, MAX_IMAGE_BYTES, MAX_IMAGES_PER_UPLOAD } from './image-upload';

function filter(mimetype: string): { err: Error | null; ok: boolean | undefined } {
  let result: { err: Error | null; ok: boolean | undefined } = { err: null, ok: undefined };
  imageUploadOptions.fileFilter!({} as any, { mimetype, originalname: 'x' } as any, (err: any, ok?: boolean) => {
    result = { err, ok };
  });
  return result;
}

describe('imageUploadOptions', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])('accepts %s', (type) => {
    expect(filter(type)).toEqual({ err: null, ok: true });
  });

  it.each(['application/pdf', 'video/mp4', 'image/svg+xml', 'text/html'])('rejects %s', (type) => {
    const { err } = filter(type);
    expect(err).toBeInstanceOf(BadRequestException);
  });

  it('caps size and count (phone photos are compressed in the browser first)', () => {
    expect(imageUploadOptions.limits).toEqual({ fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES_PER_UPLOAD });
    expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_IMAGES_PER_UPLOAD).toBe(10);
  });
});
