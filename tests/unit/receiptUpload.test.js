import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inspectReceiptImage } from '../../server/src/features/expenses/receiptUpload.middleware.js';
import sharp from '../../server/node_modules/sharp/lib/index.js';

function png(width = 2, height = 3) {
  const value = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(value);
  value.writeUInt32BE(width, 16);
  value.writeUInt32BE(height, 20);
  return value;
}

describe('receipt upload inspection', () => {
  it('decodes valid JPEG, PNG and WebP bytes', async () => {
    const formats = [
      ['jpeg', 'image/jpeg'],
      ['png', 'image/png'],
      ['webp', 'image/webp'],
    ];

    for (const [format, mimetype] of formats) {
      const buffer = await sharp({
        create: { width: 2, height: 3, channels: 3, background: '#fff' },
      })
        .toFormat(format)
        .toBuffer();

      const meta = await inspectReceiptImage({
        buffer,
        size: buffer.length,
        mimetype,
        originalname: `x.${format}`,
      });

      assert.equal(meta.mimeType, mimetype);
      assert.equal(meta.width, 2);
    }
  });

  it('rejects a mismatched MIME and non-image bytes', async () => {
    const buffer = png();
    await assert.rejects(() =>
      inspectReceiptImage({
        buffer,
        size: buffer.length,
        mimetype: 'image/jpeg',
        originalname: 'x.jpg',
      })
    );
    await assert.rejects(() =>
      inspectReceiptImage({
        buffer: Buffer.from('not image'),
        size: 9,
        mimetype: 'image/jpeg',
        originalname: 'x.jpg',
      })
    );
  });

  it('rejects a pixel-bomb candidate before AI', async () => {
    const buffer = png(9001, 2);
    await assert.rejects(() =>
      inspectReceiptImage({
        buffer,
        size: buffer.length,
        mimetype: 'image/png',
        originalname: 'x.png',
      })
    );
  });
});
