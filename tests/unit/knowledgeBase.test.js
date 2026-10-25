import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadAndChunkMarkdown, recursiveCharacterTextSplit } from '../../server/src/features/knowledgeBase/chunker.js';
import { buildGroundedPrompt, formatContextSections } from '../../server/src/features/knowledgeBase/promptBuilder.js';
import { executeRAG } from '../../server/src/features/knowledgeBase/ragService.js';
import { SERVER_MESSAGES } from '../../server/src/constants/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const knowledgeDir = path.join(projectRoot, 'data', 'knowledge');

describe('Knowledge Base Chunking and Prompt Construction Suite', () => {
  describe('1. Document Loading and Section-Aware Chunking', () => {
    it('loads all 12 sections from the SpendWise user guide markdown', () => {
      const chunks = loadAndChunkMarkdown(knowledgeDir);
      assert.equal(chunks.length, 12, 'Expected exactly 12 sections in the user guide');

      const expectedSections = [
        { num: 1, title: 'About SpendWise' },
        { num: 2, title: 'Platform Features at a Glance' },
        { num: 3, title: 'Personal Expense Tracking' },
        { num: 4, title: 'Transaction Categories and Filtering' },
        { num: 5, title: 'Receipt Scanning and OCR Review' },
        { num: 6, title: 'AI Expense Assistant' },
        { num: 7, title: 'Knowledge Base Management' },
        { num: 8, title: 'Vector Indexing and Qdrant Search' },
        { num: 9, title: 'AI Usage Analytics and Observability' },
        { num: 10, title: 'Authentication and Security Architecture' },
        { num: 11, title: 'System Configuration and Limits' },
        { num: 12, title: 'Frequently Asked Questions' },
      ];

      expectedSections.forEach((expected, idx) => {
        const chunk = chunks[idx];
        assert.equal(chunk.sectionNumber, expected.num, `Chunk ${idx} section number mismatch`);
        assert.equal(chunk.sectionTitle, expected.title, `Chunk ${idx} section title mismatch`);
        assert.ok(chunk.id.includes(`sec${expected.num}`), `Chunk ID should contain sec${expected.num}`);
        assert.equal(chunk.source, 'spendwise_user_guide.md');
        assert.ok(chunk.content.length > 0, `Chunk ${expected.num} content must not be empty`);
      });
    });

    it('preserves Section 2 Markdown table with headers and data rows intact', () => {
      const chunks = loadAndChunkMarkdown(knowledgeDir);
      const sec2 = chunks.find((c) => c.sectionNumber === 2);
      assert.ok(sec2, 'Section 2 chunk must exist');

      // Table header and separator
      assert.ok(sec2.content.includes('| Feature | Manual Transaction | Receipt Scan Draft |'));
      assert.ok(sec2.content.includes('|---|---|---|'));

      // Verify all table data rows are intact and aligned with columns
      assert.ok(sec2.content.includes('| Creation Method | Form or AI Assistant | Camera / Image Upload |'));
      assert.ok(sec2.content.includes('| Supported Types | Income and Expense | Expense |'));
      assert.ok(sec2.content.includes('| Maximum Attachment Size | N/A | 5 MB |'));
      assert.ok(sec2.content.includes('| Processing Status | Instant | OCR Review Required |'));
      assert.ok(sec2.content.includes('| Multi-item Breakdown | Optional item list | Extracted line items |'));
    });

    it('preserves Section 11 System Configuration with limits and safeguards', () => {
      const chunks = loadAndChunkMarkdown(knowledgeDir);
      const sec11 = chunks.find((c) => c.sectionNumber === 11);
      assert.ok(sec11, 'Section 11 chunk must exist');

      assert.ok(sec11.content.includes('Receipt uploads are limited to 5 MB per file.'));
      assert.ok(sec11.content.includes('Rate limiters protect API endpoints'));
    });

    it('splits text recursively using fallback hierarchy respecting chunkSize and chunkOverlap', () => {
      const sampleText = 'Paragraph 1: General rules and conduct.\n\n' +
        'Paragraph 2: Specific operational instructions for accounts.\n\n' +
        'Paragraph 3: Additional safeguards and compliance policies for financial records.';

      const chunks = recursiveCharacterTextSplit(sampleText, {
        chunkSize: 70,
        chunkOverlap: 15,
      });

      assert.ok(chunks.length > 1, 'Should split into multiple chunks');
      for (const chunk of chunks) {
        assert.ok(chunk.length <= 75, `Chunk "${chunk}" exceeds expected limit`);
        assert.ok(chunk.trim().length > 0, 'Chunk must not be empty');
      }
    });

    it('splits oversized sections into sub-chunks with parent headings and metadata', () => {
      const chunks = loadAndChunkMarkdown(knowledgeDir, { chunkSize: 140, chunkOverlap: 30 });
      assert.ok(chunks.length > 12, 'Oversized sections must split into more than 12 chunks');

      const subChunk = chunks.find((c) => c.totalParts > 1);
      assert.ok(subChunk, 'Sub-chunk with totalParts > 1 must exist');
      assert.ok(subChunk.id.includes('_p'), 'Sub-chunk ID must contain part indicator');
      assert.ok(subChunk.title.includes('Part '), 'Sub-chunk title must retain parent heading with part info');
      assert.ok(subChunk.sectionNumber > 0, 'Must preserve sectionNumber');
      assert.ok(subChunk.sectionTitle.length > 0, 'Must preserve sectionTitle');
      assert.equal(subChunk.source, 'spendwise_user_guide.md');
    });
  });

  describe('2. Prompt Construction, Grounding, and Attribution Formatting', () => {
    it('formats retrieved chunks with Document, Section, and Chunk ID headers', () => {
      const sampleChunks = [
        {
          id: 'spendwise_user_guide_sec2',
          title: '2. Platform Features at a Glance',
          source: 'spendwise_user_guide.md',
          content: '| Maximum Attachment Size | N/A | 5 MB |',
        },
      ];

      const prompt = buildGroundedPrompt('What is the maximum receipt attachment size?', sampleChunks, 'Custom Prompt Instructions');

      assert.ok(prompt.includes('Custom Prompt Instructions'));
      assert.ok(prompt.includes('Source 1: Document: spendwise_user_guide.md | Section: 2. Platform Features at a Glance | Chunk ID: spendwise_user_guide_sec2'));
      assert.ok(prompt.includes('| Maximum Attachment Size | N/A | 5 MB |'));
      assert.ok(prompt.includes('User Question:\nWhat is the maximum receipt attachment size?'));
    });

    it('formats context sections with document, section, and chunk ID headers', () => {
      const chunks = [
        {
          id: 'chunk_1',
          title: 'Section 1',
          source: 'spendwise_user_guide.md',
          content: 'Content for section 1.',
        },
        {
          id: 'chunk_2',
          title: 'Section 2',
          source: 'spendwise_user_guide.md',
          content: 'Content for section 2.',
        },
      ];

      const formatted = formatContextSections(chunks);
      assert.ok(formatted.includes('[Source 1: Document: spendwise_user_guide.md | Section: Section 1 | Chunk ID: chunk_1]'));
      assert.ok(formatted.includes('Content for section 1.'));
      assert.ok(formatted.includes('[Source 2: Document: spendwise_user_guide.md | Section: Section 2 | Chunk ID: chunk_2]'));
      assert.ok(formatted.includes('Content for section 2.'));
    });

    it('handles empty chunks gracefully in formatContextSections', () => {
      assert.equal(formatContextSections([]), '');
      assert.equal(formatContextSections(null), '');
    });

    it('returns safe fallback when executeRAG receives empty chunks', async () => {
      const result = await executeRAG('What is an expense category?', {
        retrieverFn: async () => [],
      });
      assert.equal(result.status, 'INSUFFICIENT');
      assert.equal(result.passedThreshold, false);
      assert.equal(result.refusalText, SERVER_MESSAGES.ERRORS.INSUFFICIENT_INFORMATION);
      assert.deepEqual(result.sources, []);
    });
  });
});
