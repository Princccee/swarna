import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

/** Per-photo cap. The web app shrinks phone photos to ~300 KB before upload; this only stops abuse. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES_PER_UPLOAD = 10;

// Raster photo formats only (no SVG: it can carry script and is served from our own bucket)
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

/** Multer options for item / order photo uploads (multipart field name: "images"). */
export const imageUploadOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES_PER_UPLOAD },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new BadRequestException(`Only photos (JPEG, PNG, WebP, HEIC) can be uploaded — got ${file.mimetype}`), false);
  },
};
