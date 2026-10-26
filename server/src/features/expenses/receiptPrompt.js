import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPrompt } from '../analytics/usageTracker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const promptsDirectory = path.resolve(__dirname, '../../../prompts/receipts');

export const RECEIPT_PROMPT_ID = 'receipt_extraction';
export const RECEIPT_PROMPT_VERSION = process.env.RECEIPT_PROMPT_VERSION || 'receipt-v3';

/**
 * Loads the active receipt prompt text from versioned markdown storage.
 *
 * @param {string} [version=RECEIPT_PROMPT_VERSION] - Version identifier (e.g. 'receipt-v3')
 * @returns {string} Prompt content
 */
export function getReceiptPrompt(version = RECEIPT_PROMPT_VERSION) {
  if (!/^receipt-v\d+$/.test(version)) {
    throw new Error('Invalid receipt prompt version.');
  }
  const filePath = path.join(promptsDirectory, `${version}.md`);
  if (!fs.existsSync(filePath)) {
    console.warn(`[ReceiptPrompt] Version "${version}" not found. Falling back to "${RECEIPT_PROMPT_VERSION}".`);
    const defaultPath = path.join(promptsDirectory, `${RECEIPT_PROMPT_VERSION}.md`);
    if (fs.existsSync(defaultPath)) {
      return fs.readFileSync(defaultPath, 'utf8').trim();
    }
    return 'Extract the receipt into the requested JSON schema. Return only JSON.';
  }
  return fs.readFileSync(filePath, 'utf8').trim();
}

/**
 * Returns complete version metadata for the receipt prompt, including stable ID,
 * explicit version with content hash, and resolved prompt text.
 *
 * @param {string} [version=RECEIPT_PROMPT_VERSION]
 * @returns {{ id: string, baseVersion: string, version: string, text: string }}
 */
export function getReceiptPromptDetails(version = RECEIPT_PROMPT_VERSION) {
  const text = getReceiptPrompt(version);
  const hash = hashPrompt(text) || 'unhashed';
  return {
    id: RECEIPT_PROMPT_ID,
    baseVersion: version,
    version: `${version}:${hash}`,
    text,
  };
}
