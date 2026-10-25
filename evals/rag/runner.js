import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { orchestrateChat } from '../../server/src/features/assistant/assistant.service.js';
import { config } from '../../server/src/config.js';
import { acceptanceCases } from './cases.js';

// Small delay between calls to avoid API rate limits
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runEvaluationSuite() {
  console.log('================================================================');
  console.log('          SPENDWISE RAG - ACCEPTANCE & VERIFICATION EVALS       ');
  console.log('================================================================\n');

  const report = {
    timestamp: new Date().toISOString(),
    config: {
      collection: config.qdrantCollection,
      embeddingModel: config.embeddingModel,
      geminiModel: config.geminiModel,
      similarityThreshold: config.similarityThreshold,
      topK: config.topK,
      vectorSize: config.vectorSize,
    },
    tests: [],
  };

  let passedCount = 0;

  for (const t of acceptanceCases) {
    console.log('----------------------------------------------------------------');
    console.log(`RUNNING EVAL ${t.id}: ${t.name}`);
    console.log(`QUERY: "${t.query}"`);

    try {
      const res = await orchestrateChat(t.query, { strategy: 'rag' });
      console.log(`ANSWER:\n${res.answer}`);
      console.log(`SOURCES:`, res.sources.map(s => `[${s.id}] ${s.title} (score: ${s.score})`));

      const passed = t.validate(res);
      console.log(`STATUS: ${passed ? 'PASSED' : 'FAILED'}`);

      if (passed) passedCount++;

      report.tests.push({
        id: t.id,
        name: t.name,
        query: t.query,
        status: passed ? 'PASSED' : 'FAILED',
        answer: res.answer,
        sources: res.sources,
      });
    } catch (err) {
      console.error(`ERROR in Eval ${t.id}:`, err.message);
      report.tests.push({
        id: t.id,
        name: t.name,
        query: t.query,
        status: 'FAILED',
        error: err.message,
      });
    }

    // Gentle pacing to avoid API throttling
    await sleep(800);
  }

  const outputPath = path.resolve(process.cwd(), 'test-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passedCount}/${acceptanceCases.length} acceptance evaluations passed.`);
  console.log(`Detailed evaluation report written to ${outputPath}`);
  console.log('================================================================\n');

  if (passedCount < acceptanceCases.length) {
    process.exit(1);
  }
}

// Auto-run if executed directly via CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runEvaluationSuite().catch(err => {
    console.error('Fatal evaluation suite failure:', err);
    process.exit(1);
  });
}

