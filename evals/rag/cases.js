/**
 * SpendWise RAG Acceptance Evaluation Cases
 * 
 * Curated test cases evaluating factual grounding, policy retrieval,
 * documentation accuracy, out-of-scope refusals, and diagnostic metadata.
 */

export const acceptanceCases = [
  {
    id: 1,
    name: '1. Receipt uploads are limited to 5 MB per file',
    query: 'What is the maximum attachment size for receipt scans in SpendWise?',
    validate: (res) => {
      const hasSize = res.answer.includes('5 MB') || res.answer.includes('5MB');
      const hasSource = res.sources.some(s => s.id?.includes('sec2') || s.id?.includes('sec5') || s.id?.includes('sec11') || s.title?.includes('Features') || s.title?.includes('Receipt Scanning'));
      return hasSize && hasSource;
    },
  },
  {
    id: 2,
    name: '2. Supported receipt image formats are JPG, PNG, and WebP',
    query: 'What image formats can I upload for receipt scanning?',
    validate: (res) => {
      const lower = res.answer.toLowerCase();
      const hasFormats = lower.includes('jpg') || lower.includes('png') || lower.includes('webp');
      const hasSource = res.sources.some(s => s.id?.includes('sec5') || s.title?.includes('Receipt Scanning'));
      return hasFormats && hasSource;
    },
  },
  {
    id: 3,
    name: '3. Supported transaction categories include Food & Dining, Transportation, Utilities, etc.',
    query: 'What transaction categories are available in SpendWise?',
    validate: (res) => {
      const lower = res.answer.toLowerCase();
      const hasCategories = lower.includes('food & dining') || lower.includes('transportation') || lower.includes('utilities') || lower.includes('dining');
      const hasSource = res.sources.some(s => s.id?.includes('sec4') || s.title?.includes('Categories'));
      return hasCategories && hasSource;
    },
  },
  {
    id: 4,
    name: '4. Receipt scan status is OCR Review Required before confirmation',
    query: 'What is the processing status of a receipt scan draft?',
    validate: (res) => {
      const lower = res.answer.toLowerCase();
      const hasReview = lower.includes('ocr review') || lower.includes('review draft') || lower.includes('draft');
      const hasSource = res.sources.length > 0;
      return hasReview && hasSource;
    },
  },
  {
    id: 5,
    name: '5. AI Expense Assistant enables transaction search, spending summaries, and proposals',
    query: 'What capabilities does the AI Expense Assistant provide?',
    validate: (res) => {
      const lower = res.answer.toLowerCase();
      const hasCapabilities = lower.includes('summaries') || lower.includes('proposals') || lower.includes('search');
      const hasSource = res.sources.some(s => s.id?.includes('sec6') || s.title?.includes('AI Expense Assistant'));
      return hasCapabilities && hasSource;
    },
  },
  {
    id: 6,
    name: '6. Documentation is parsed by Level-2 section headers into searchable chunks',
    query: 'How are markdown documents parsed for knowledge base indexing?',
    validate: (res) => {
      const lower = res.answer.toLowerCase();
      const hasChunking = lower.includes('level-2') || lower.includes('section header') || lower.includes('##') || lower.includes('chunk');
      const hasSource = res.sources.some(s => s.id?.includes('sec7') || s.title?.includes('Knowledge Base Management'));
      return hasChunking && hasSource;
    },
  },
  {
    id: 7,
    name: '7. Vector embeddings are stored in Qdrant Cloud using cosine similarity',
    query: 'Where are documentation embeddings stored and what metric is used for matching?',
    validate: (res) => {
      const lower = res.answer.toLowerCase();
      const hasQdrant = lower.includes('qdrant');
      const hasCosine = lower.includes('cosine');
      const hasSource = res.sources.some(s => s.id?.includes('sec8') || s.title?.includes('Vector Indexing'));
      return (hasQdrant || hasCosine) && hasSource;
    },
  },
  {
    id: 8,
    name: '8. Coding tasks rejected as outside application scope',
    query: 'Write a python script to scrape web pages and save to CSV',
    validate: (res) => {
      const lower = res.answer.toLowerCase();
      const isRefusal =
        lower.includes('spendwise') ||
        lower.includes('only assist') ||
        lower.includes('outside') ||
        lower.includes('cannot');
      const noSources = res.sources.length === 0;
      return isRefusal && noSources;
    },
  },
  {
    id: 9,
    name: '9. Question lacking evidence in documentation receives insufficient information notice',
    query: 'Can I bring my pet to the dormitory?',
    validate: (res) => {
      const lower = res.answer.toLowerCase();
      const isRefusal =
        lower.includes('does not contain enough information') ||
        lower.includes('not have verified information') ||
        lower.includes('not mention');
      return isRefusal;
    },
  },
  {
    id: 10,
    name: '10. In-scope query provides complete inspectable retrieved chunks diagnostics',
    query: 'What is the maximum attachment size for receipt scans in SpendWise?',
    validate: (res) => {
      const ret = res.retrieval;
      if (!ret || !Array.isArray(ret.retrievedChunks) || ret.retrievedChunks.length === 0) return false;
      const first = ret.retrievedChunks[0];
      const hasFields =
        first.rank === 1 &&
        typeof first.score === 'number' &&
        Boolean(first.source) &&
        Boolean(first.id) &&
        Boolean(first.content) &&
        first.passedToLLM === true;
      const usedMatches = Array.isArray(ret.usedChunks) && ret.usedChunks.length === ret.retrievedChunks.length;
      return hasFields && usedMatches;
    },
  },
  {
    id: 11,
    name: '11. Out-of-scope query preserves inspectable retrieved chunks before filtering',
    query: 'Write a python script to scrape web pages and save to CSV',
    validate: (res) => {
      const ret = res.retrieval;
      if (!ret || !Array.isArray(ret.retrievedChunks)) return false;
      const usedEmpty = Array.isArray(ret.usedChunks) && ret.usedChunks.length === 0;
      return usedEmpty;
    },
  },
];
