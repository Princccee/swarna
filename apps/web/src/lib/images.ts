import { api } from './api';

const MAX_DIMENSION = 1600; // px on the long edge — plenty for item / design photos
const JPEG_QUALITY = 0.82;
const SMALL_ENOUGH = 500 * 1024;

/**
 * Shrink a phone photo before upload: 5–10 MB camera shots become ~200–400 KB JPEGs, which
 * upload quickly on mobile data. Applies the EXIF rotation. Falls back to the original file
 * if the browser cannot decode it (e.g. HEIC on some browsers) or compression doesn't help.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SMALL_ENOUGH) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.fillStyle = '#ffffff'; // transparent PNG areas would otherwise turn black in JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob || blob.size >= file.size) return file;

  const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
}

/** POST photos to an `/…/images` endpoint (multipart field "images"). */
export function uploadImages(path: string, files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append('images', f));
  // Let the browser set the multipart boundary (the api client defaults to JSON)
  return api.post(path, form, { headers: { 'Content-Type': undefined } });
}
