/**
 * Configuration and color constants for SpendWise AI Usage Analytics.
 */

export const ANALYTICS_CONFIG = Object.freeze({
  TIME_RANGES: [
    { value: '1h', label: 'Last 1 Hour' },
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: 'all', label: 'All Time' },
  ],
  FEATURES: [
    { value: 'all', label: 'All Features' },
    { value: 'rag_chat', label: 'RAG Chat' },
    { value: 'embedding', label: 'Embedding' },
    { value: 'knowledge_index', label: 'Knowledge Index' },
  ],
  OUTCOMES: [
    { value: 'all', label: 'All Outcomes' },
    { value: 'success', label: 'Success' },
    { value: 'failure', label: 'Failure' },
    { value: 'refusal', label: 'Refusal' },
  ],
  PAGE_SIZE_OPTIONS: [10, 20, 50],
  DEFAULT_PAGE_SIZE: 10,
  DEFAULT_TIME_RANGE: '7d',
});

export const ANALYTICS_CHART_CONFIG = Object.freeze({
  DIMENSIONS: {
    WIDTH: 500,
    HEIGHT: 150,
    PADDING_BOTTOM: 25,
    PADDING_TOP: 15,
  },
  COLORS: {
    SUCCESS: '#16a34a',
    FAILURE: '#dc2626',
    REFUSAL: '#d97706',
    TOKEN: '#0284c7',
    PALETTE: ['#0284c7', '#16a34a', '#d97706', '#9333ea', '#64748b'],
  },
  PROMPT_HASH_DISPLAY_LENGTH: 8,
});
