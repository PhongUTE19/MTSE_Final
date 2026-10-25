import crypto from 'crypto';
import multer from 'multer';
import sharp from 'sharp';
import { AppError, ValidationError } from '../../shared/errors/index.js';
import { HTTP_STATUS } from '../../constants/index.js';

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const MAX_RECEIPT_DIMENSION = 8000;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const uploader = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_BYTES, files: 1, fields: 4 },
}).single('receipt');

function pngDimensions(buffer) {
  return buffer.length >= 24
    ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
    : null;
}

function jpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > buffer.length) return null;
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += length + 2;
  }
  return null;
}

function webpDimensions(buffer) {
  if (buffer.length < 30) return null;
  const kind = buffer.toString('ascii', 12, 16);
  if (kind === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    };
  }
  return null; // VP8/VP8L are intentionally rejected rather than guessed.
}

export async function inspectReceiptImage(file) {
  if (!file?.buffer?.length) {
    throw new ValidationError('A receipt image is required.');
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    throw new ValidationError('Receipt image must be 5 MB or smaller.');
  }

  let detectedType;
  if (file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    detectedType = 'image/png';
  } else if (file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff) {
    detectedType = 'image/jpeg';
  } else if (
    file.buffer.toString('ascii', 0, 4) === 'RIFF' &&
    file.buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    detectedType = 'image/webp';
  } else {
    throw new ValidationError('Receipt must be a valid JPG, PNG, or WebP image.');
  }

  if (!ACCEPTED_TYPES.has(detectedType) || (file.mimetype && file.mimetype !== detectedType)) {
    throw new ValidationError('Receipt MIME type does not match the image content.');
  }

  let dimensions;
  try {
    const decoded = await sharp(file.buffer, {
      failOn: 'error',
      limitInputPixels: MAX_RECEIPT_DIMENSION * MAX_RECEIPT_DIMENSION,
    }).metadata();
    dimensions = { width: decoded.width, height: decoded.height };
  } catch {
    throw new ValidationError('Receipt image is malformed or exceeds the pixel safety limit.');
  }

  if (
    !dimensions.width ||
    !dimensions.height ||
    dimensions.width > MAX_RECEIPT_DIMENSION ||
    dimensions.height > MAX_RECEIPT_DIMENSION
  ) {
    throw new ValidationError('Receipt image dimensions are unsupported.');
  }

  return {
    filename: file.originalname.slice(0, 150),
    mimeType: detectedType,
    size: file.size,
    width: dimensions.width,
    height: dimensions.height,
    sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
  };
}

let activeReceiptUploads = 0;
const MAX_CONCURRENT_RECEIPT_UPLOADS = 2;

export function uploadReceiptImage(req, res, next) {
  if (!req.is('multipart/form-data')) {
    return next(
      new AppError('Receipt uploads must use multipart/form-data.', HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE)
    );
  }
  if (activeReceiptUploads >= MAX_CONCURRENT_RECEIPT_UPLOADS) {
    return next(
      new AppError('Receipt upload capacity is busy. Please retry shortly.', HTTP_STATUS.TOO_MANY_REQUESTS)
    );
  }

  activeReceiptUploads++;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      activeReceiptUploads--;
    }
  };

  res.once('finish', release);
  res.once('close', release);
  req.setTimeout(30000, () => {
    release();
    req.destroy(new Error('Receipt upload timed out.'));
  });

  uploader(req, res, (error) => {
    if (error) {
      return next(
        new ValidationError(
          error.code === 'LIMIT_FILE_SIZE'
            ? 'Receipt image must be 5 MB or smaller.'
            : 'Invalid receipt upload.'
        )
      );
    }
    inspectReceiptImage(req.file)
      .then((meta) => {
        req.receiptFile = req.file;
        req.receiptMeta = meta;
        next();
      })
      .catch(next);
  });
}
