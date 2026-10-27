/**
 * Runs the synthetic corpus against real configured Gemini using the active
 * receipt extraction prompt. It never calls Supabase or application HTTP endpoints.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractReceiptImage } from '../../server/src/shared/integrations/ai/index.js';
import { config } from '../../server/src/config.js';
import { getReceiptPrompt, RECEIPT_PROMPT_VERSION } from '../../server/src/features/expenses/receiptPrompt.js';
import { liveReceiptCases } from './live-cases.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const fixturesDirectory = path.join(root, 'fixtures');
const outputName = process.argv.find((argument) => argument.startsWith('--output='))?.split('=')[1] || 'live-results.json';
if (!/^[a-z0-9._-]+$/i.test(outputName)) throw new Error('Invalid --output filename.');
const outputPath = path.join(root, outputName);
const reportPath = path.join(root, outputName === 'live-results.json' ? 'LIVE_EVALUATION_REPORT.md' : `${path.parse(outputName).name}.md`);
const promptVersions = process.argv.find((argument) => argument.startsWith('--versions='))?.split('=')[1]?.split(',')
  || [RECEIPT_PROMPT_VERSION];
const batchIndex = Number.parseInt(process.argv.find((argument) => argument.startsWith('--batch='))?.split('=')[1] || '0', 10);
const batchSize = Number.parseInt(process.argv.find((argument) => argument.startsWith('--batch-size='))?.split('=')[1] || '20', 10);
const reset = process.argv.includes('--reset');
const reportOnly = process.argv.includes('--report-only');

if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY is required for live evaluation.');

function tokenMetadata(usage = {}) {
  return {
    promptTokenCount: usage.promptTokenCount ?? null,
    candidatesTokenCount: usage.candidatesTokenCount ?? null,
    totalTokenCount: usage.totalTokenCount ?? null,
  };
}

function evaluationPass(testCase, extraction) {
  if (testCase.expectedDecision === 'reject' || !extraction) return false;
  const expected = testCase.expectedExtraction;
  return extraction.documentType === expected.documentType
    && extraction.transactionType === expected.transactionType
    && extraction.merchant?.toLowerCase() === expected.merchant.toLowerCase()
    && extraction.totalAmount === expected.totalAmount
    && extraction.currency === expected.currency
    && extraction.category === expected.category
    && extraction.items.length === expected.itemCount
    && expected.nullFields.every((field) => extraction[field] === null)
    && (expected.transactionDate === null || extraction.transactionDate === expected.transactionDate);
}

function safeError(error) {
  return { name: error?.name || 'Error', code: error?.receiptFailureCode || null, message: error?.safeMessage || error?.message || 'Unknown error' };
}

const startedAt = new Date().toISOString();
const model = config.geminiModel;
const previousArtifact = !reset ? await fs.readFile(outputPath, 'utf8').then(JSON.parse).catch(() => null) : null;
const selectedCases = reportOnly ? [] : liveReceiptCases.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);
if (!reportOnly && selectedCases.length === 0) throw new Error(`Batch ${batchIndex} has no fixtures.`);
const selectedIds = new Set(selectedCases.map((testCase) => testCase.id));
const results = (previousArtifact?.results || []).filter((entry) => !selectedIds.has(entry.fixture));
const fixtureManifest = (previousArtifact?.fixtureManifest || []).filter((entry) => !selectedIds.has(entry.id));
const promptDefinitions = Object.fromEntries(promptVersions.map((promptVersion) => {
  const prompt = getReceiptPrompt(promptVersion);
  return [promptVersion, { prompt, promptHash: crypto.createHash('sha256').update(prompt).digest('hex') }];
}));

// Interleave versions by fixture so transient provider conditions do not
// systematically favour whichever version happens to run first.
for (const testCase of selectedCases) {
  const buffer = await fs.readFile(path.join(fixturesDirectory, `${testCase.id}.png`));
  fixtureManifest.push({ id: testCase.id, filename: `${testCase.id}.png`, sha256: crypto.createHash('sha256').update(buffer).digest('hex'), source: 'locally-generated synthetic SVG-to-PNG fixture', group: testCase.group, kind: testCase.kind });
  for (const promptVersion of promptVersions) {
    const { prompt, promptHash } = promptDefinitions[promptVersion];
    const started = Date.now();
    let actual = null;
    let error = null;
    try {
      const response = await extractReceiptImage({ buffer, mimeType: 'image/png' }, { prompt, model });
      actual = response.extraction;
      const pass = evaluationPass(testCase, actual);
      results.push({ fixture: testCase.id, group: testCase.group, promptVersion, promptHash, model: response.model, expected: { decision: testCase.expectedDecision, extraction: testCase.expectedExtraction ?? null, acceptedFailureCodes: testCase.expectedFailureCodes ?? [] }, actual: { decision: 'accept', extraction: actual }, pass, latencyMs: response.latencyMs ?? Date.now() - started, tokenUsage: tokenMetadata(response.tokenUsage) });
    } catch (caught) {
      error = safeError(caught);
      const pass = testCase.expectedDecision === 'reject' && testCase.expectedFailureCodes.includes(error.code);
      results.push({ fixture: testCase.id, group: testCase.group, promptVersion, promptHash, model, expected: { decision: testCase.expectedDecision, extraction: testCase.expectedExtraction ?? null, acceptedFailureCodes: testCase.expectedFailureCodes ?? [] }, actual: { decision: 'reject', error }, pass, latencyMs: Date.now() - started, tokenUsage: tokenMetadata() });
    }
    const last = results.at(-1);
    console.log(`${promptVersion} ${testCase.id}: ${last.pass ? 'PASS' : 'FAIL'} (${last.latencyMs}ms)${error ? ` — ${error.code || error.name}` : ''}`);
  }
}

const byVersion = Object.fromEntries(promptVersions.map((version) => {
  const entries = results.filter((entry) => entry.promptVersion === version);
  const passed = entries.filter((entry) => entry.pass).length;
  return [version, { total: entries.length, passed, failed: entries.length - passed, passRate: Number(((passed / entries.length) * 100).toFixed(1)), meanLatencyMs: Math.round(entries.reduce((sum, entry) => sum + entry.latencyMs, 0) / entries.length), tokensReported: entries.filter((entry) => entry.tokenUsage.totalTokenCount !== null).length }];
}));
const byGroup = Object.fromEntries(promptVersions.map((version) => [version, Object.fromEntries([...new Set(liveReceiptCases.map((testCase) => testCase.group))].map((group) => {
  const entries = results.filter((entry) => entry.promptVersion === version && entry.group === group);
  const passed = entries.filter((entry) => entry.pass).length;
  return [group, { total: entries.length, passed, failed: entries.length - passed, passRate: Number(((passed / entries.length) * 100).toFixed(1)) }];
}))]));

const artifact = { generatedAt: new Date().toISOString(), syntheticOnly: true, fixtureCount: fixtureManifest.length, requestedFixtureCount: liveReceiptCases.length, batch: { index: batchIndex, size: batchSize, reset }, model, fixtureManifest, prompts: Object.fromEntries(promptVersions.map((version) => [version, { sha256: promptDefinitions[version].promptHash }])), summary: byVersion, groupSummary: byGroup, results };
await fs.writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);

const rows = results.map((entry) => `| ${entry.promptVersion} | ${entry.fixture} | ${entry.group} | ${entry.expected.decision} | ${entry.actual.decision} | ${entry.pass ? 'PASS' : 'FAIL'} | ${entry.latencyMs} | ${entry.tokenUsage.totalTokenCount ?? 'n/a'} |`).join('\n');
const summaryRows = Object.entries(byVersion).map(([version, value]) => `| ${version} | ${value.passed}/${value.total} | ${value.passRate}% | ${value.meanLatencyMs} | ${value.tokensReported}/${value.total} |`).join('\n');
const groupRows = Object.entries(byGroup).flatMap(([version, groups]) => Object.entries(groups).map(([group, value]) => `| ${version} | ${group} | ${value.passed}/${value.total} | ${value.passRate}% |`)).join('\n');
await fs.writeFile(reportPath, `# Live Gemini Receipt Evaluation\n\nGenerated: ${artifact.generatedAt}\n\n**Corpus limitation:** all 20 images are local, text-layout **synthetic fixtures**. They are not real receipts, photos, scans, or a claim of real-world OCR accuracy. The runner invokes the configured Gemini model (${model}) directly, without Supabase or HTTP/database writes. Fixture file SHA-256 values are frozen in [live-results.json](./live-results.json).\n\n## Before/after prompt comparison\n\n| Prompt | Passed | Pass rate | Mean latency (ms) | Calls with token metadata |\n| --- | --- | --- | --- | --- |\n${summaryRows}\n\n| Prompt | Group | Passed | Pass rate |\n| --- | --- | --- | --- |\n${groupRows}\n\nPrompt hashes are captured in [live-results.json](./live-results.json) independently of provider analytics. This is necessary because the provider's analytics label is currently based on the process default prompt version rather than the per-call prompt passed by this evaluator.\n\n## Per-case results\n\n| Prompt | Fixture | Group | Expected | Actual | Result | Latency (ms) | Total tokens |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${rows}\n\n## Interpretation\n\nA normal/edge fixture passes only if Gemini accepts it and returns the expected document/type, merchant, total, currency, category, item count, and required date/null fields. A refusal fixture passes only with a safe \`NOT_A_RECEIPT\` or \`PROMPT_INJECTION_REJECTED\` code; generic provider errors fail. Structured outcomes and safe errors are saved in \`live-results.json\`.\n\nRe-run: \`node evals/receipts/generate-live-fixtures.js\` then \`node evals/receipts/run-live-gemini.js\`.\n`);
console.log(`\nSaved ${outputPath} and ${reportPath}`);
