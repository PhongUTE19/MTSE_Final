import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import express from '../../server/node_modules/express/index.js';
import { createHealthHandler, createLiveHealthHandler } from '../../server/src/shared/middleware/index.js';
import { resolvePublicSupabaseConfig } from '../../client/src/shared/services/supabaseAuth.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readRepoFile = (relPath) => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

describe('P4-T04 Docker & Deployment Hardening Suite', () => {
  describe('1. F4-03 Frontend Public Runtime Configuration', () => {
    it('resolves runtime container config without Vite env and falls back to Vite env in local dev', () => {
      const fromRuntime = resolvePublicSupabaseConfig({
        runtimeConfig: {
          supabaseUrl: 'https://demo.supabase.co',
          supabaseAnonKey: 'public-anon-key',
        },
        env: {},
      });
      assert.deepEqual(fromRuntime, {
        supabaseUrl: 'https://demo.supabase.co',
        supabaseAnonKey: 'public-anon-key',
        isConfigured: true,
      });

      const fromViteEnv = resolvePublicSupabaseConfig({
        runtimeConfig: {},
        env: {
          VITE_SUPABASE_URL: 'https://dev.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'dev-anon-key',
        },
      });
      assert.deepEqual(fromViteEnv, {
        supabaseUrl: 'https://dev.supabase.co',
        supabaseAnonKey: 'dev-anon-key',
        isConfigured: true,
      });
    });

    it('handles missing or malformed public configuration predictably and never exposes server secrets', () => {
      const missing = resolvePublicSupabaseConfig({ runtimeConfig: {}, env: {} });
      assert.deepEqual(missing, {
        supabaseUrl: '',
        supabaseAnonKey: '',
        isConfigured: false,
      });

      const malformed = resolvePublicSupabaseConfig({
        runtimeConfig: {
          supabaseUrl: 'javascript:alert(1)',
          supabaseAnonKey: 'public-anon-key',
        },
        env: {},
      });
      assert.equal(malformed.isConfigured, false);
      assert.equal(malformed.supabaseUrl, '');

      const secretCheck = resolvePublicSupabaseConfig({
        runtimeConfig: {
          supabaseUrl: 'https://demo.supabase.co',
          supabaseAnonKey: 'public-anon-key',
          supabaseServiceKey: 'secret-role-key',
          geminiApiKey: 'secret-gemini-key',
        },
        env: {
          SUPABASE_SECRET_KEY: 'secret-role-key',
          GEMINI_API_KEY: 'secret-gemini-key',
        },
      });
      assert.deepEqual(Object.keys(secretCheck).sort(), ['isConfigured', 'supabaseAnonKey', 'supabaseUrl']);

      // Container runtime config must take precedence over Vite build-time fallback
      const precedence = resolvePublicSupabaseConfig({
        runtimeConfig: {
          supabaseUrl: 'https://runtime.supabase.co',
          supabaseAnonKey: 'runtime-anon-key',
        },
        env: {
          VITE_SUPABASE_URL: 'https://buildtime.supabase.co',
          VITE_SUPABASE_ANON_KEY: 'buildtime-anon-key',
        },
      });
      assert.equal(precedence.supabaseUrl, 'https://runtime.supabase.co');
      assert.equal(precedence.supabaseAnonKey, 'runtime-anon-key');
    });

    it('entrypoint 40-runtime-config.sh safely serializes quotes, backslashes, newlines, unicode, and injection payloads', (t) => {
      const shBin = process.platform === 'win32'
        ? (fs.existsSync('C:\\Program Files\\Git\\bin\\sh.exe') ? 'C:\\Program Files\\Git\\bin\\sh.exe' : 'sh')
        : 'sh';

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spendwise-rtcfg-'));
      t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

      const outPath = path.join(tmpDir, 'runtime-config.js');
      const scriptPath = path.join(ROOT, 'client', 'docker-entrypoint.d', '40-runtime-config.sh');

      const adversarialKey = 'key"with\\slash\nand\r\ttab-Cà phê ☕-"; window.__PWNED__ = true; //</script>';
      const adversarialUrl = 'https://proj.supabase.co/?q="a\\b"';

      const run = spawnSync(shBin, [scriptPath], {
        env: {
          ...process.env,
          RUNTIME_CONFIG_PATH: outPath,
          VITE_SUPABASE_URL: adversarialUrl,
          VITE_SUPABASE_ANON_KEY: adversarialKey,
        },
        encoding: 'utf8',
      });
      if (run.error?.code === 'ENOENT') {
        t.skip('POSIX sh not available in this environment');
        return;
      }
      assert.equal(run.status, 0, `Entrypoint script failed: ${run.stderr}`);

      const generated = fs.readFileSync(outPath, 'utf8');
      const sandbox = { window: {} };
      vm.runInNewContext(generated, sandbox);
      assert.equal(sandbox.window.__PWNED__, undefined);
      assert.equal(sandbox.window.__SPENDWISE_RUNTIME_CONFIG__.supabaseUrl, adversarialUrl);
      assert.equal(sandbox.window.__SPENDWISE_RUNTIME_CONFIG__.supabaseAnonKey, adversarialKey);

      // Malformed URL must disable runtime config rather than leaving a bogus URL
      const badRun = spawnSync(shBin, [scriptPath], {
        env: {
          ...process.env,
          RUNTIME_CONFIG_PATH: outPath,
          VITE_SUPABASE_URL: 'javascript:alert(1)',
          VITE_SUPABASE_ANON_KEY: 'some-key',
        },
        encoding: 'utf8',
      });
      assert.equal(badRun.status, 0);
      assert.ok(badRun.stderr.includes('Warning:'));
      const badSandbox = { window: {} };
      vm.runInNewContext(fs.readFileSync(outPath, 'utf8'), badSandbox);
      assert.equal(badSandbox.window.__SPENDWISE_RUNTIME_CONFIG__.supabaseUrl, '');
      assert.equal(badSandbox.window.__SPENDWISE_RUNTIME_CONFIG__.supabaseAnonKey, '');
    });
  });

  describe('2. F4-03 Dockerfiles, Compose, and Build-Context Hygiene', () => {
    it('decouples client/Dockerfile from .env and configures runtime entrypoint injection', () => {
      const clientDockerfile = readRepoFile('client/Dockerfile');
      assert.equal(clientDockerfile.includes('grep -Eq \'^VITE_SUPABASE_URL'), false);
      assert.ok(clientDockerfile.includes('40-runtime-config.sh'));

      const indexHtml = readRepoFile('client/index.html');
      const runtimeScriptIdx = indexHtml.indexOf('/runtime-config.js');
      const mainScriptIdx = indexHtml.indexOf('/src/main.jsx');
      assert.ok(runtimeScriptIdx !== -1 && runtimeScriptIdx < mainScriptIdx);
      assert.ok(fs.existsSync(path.join(ROOT, 'client', 'public', 'runtime-config.js')));
      assert.ok(fs.existsSync(path.join(ROOT, 'client', 'docker-entrypoint.d', '40-runtime-config.sh')));
    });

    it('excludes local .env secret files from all Docker build contexts while preserving canonical runtime assets', () => {
      const rootIgnore = readRepoFile('.dockerignore');
      const clientIgnore = readRepoFile('client/.dockerignore');
      const serverIgnore = readRepoFile('server/.dockerignore');

      assert.equal(clientIgnore.includes('!.env\n'), false);
      assert.equal(clientIgnore.trim().endsWith('!.env'), false);
      assert.ok(clientIgnore.includes('**/.env'));
      assert.ok(clientIgnore.includes('**/.env.*'));
      assert.ok(serverIgnore.includes('**/.env'));
      assert.ok(serverIgnore.includes('**/.env.*'));
      assert.ok(rootIgnore.includes('**/.env'));

      // Canonical backend assets copied by server/Dockerfile must exist and not be ignored
      assert.ok(fs.existsSync(path.join(ROOT, 'server', 'prompts')));
      assert.ok(fs.existsSync(path.join(ROOT, 'data', 'knowledge')));
      assert.equal(rootIgnore.includes('server/prompts'), false);
      assert.equal(rootIgnore.includes('data/knowledge'), false);
    });

    it('validates docker-compose.yml healthchecks, service_healthy dependency, and optional Qdrant semantics', () => {
      const compose = readRepoFile('docker-compose.yml');
      assert.ok(compose.includes('/api/health/live'));
      assert.ok(compose.includes('condition: service_healthy'));
      assert.ok(compose.includes('http://127.0.0.1:80/runtime-config.js'));
      assert.ok(compose.includes('__SPENDWISE_RUNTIME_CONFIG__'));
      assert.ok(compose.includes('id=\\"root\\"'));
      // Client must never mount server/.env
      const clientSection = compose.slice(compose.indexOf('  client:'));
      assert.equal(clientSection.includes('server/.env'), false);
      // Qdrant must not be a mandatory depends_on service
      assert.equal(compose.includes('qdrant:'), false);

      // Run real Docker Compose config validation if CLI is installed
      try {
        execFileSync('docker', ['compose', 'config', '--quiet'], { cwd: ROOT, stdio: 'pipe' });
      } catch (err) {
        if (err?.code === 'ENOENT') return; // Skip only if docker CLI is absent
        throw err;
      }
    });

    it('serves /api/health/live as 200 OK even when optional Qdrant is unavailable', async () => {
      const app = express();
      app.get('/api/health/live', createLiveHealthHandler());
      app.get('/api/health', createHealthHandler({
        getVectorStoreCount: async () => { throw new Error('QDRANT_URL is not configured'); },
        nodeEnv: 'production',
      }));

      const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      });
      try {
        const { port } = server.address();
        const liveRes = await fetch(`http://127.0.0.1:${port}/api/health/live`);
        assert.equal(liveRes.status, 200);
        assert.deepEqual(await liveRes.json(), { status: 'ok' });

        const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
        assert.equal(healthRes.status, 500);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });

  describe('3. F4-06 Supabase Migration Ordering & Checklist Coverage', () => {
    it('confirms migrations 009 through 014 exist in timestamp order and are listed in deployment checklist', () => {
      const expected = [
        '202611170009_confirm_staged_receipt_transaction.sql',
        '202611170010_chat_history.sql',
        '202611170011_retire_legacy_drafts_and_extractions.sql',
        '202611170012_chat_streaming_lifecycle.sql',
        '202611170013_chat_stream_concurrency_hardening.sql',
        '202611170014_add_usage_source_to_ai_usage.sql',
      ];

      const actual = fs.readdirSync(path.join(ROOT, 'supabase', 'migrations')).sort();
      for (const file of expected) {
        assert.ok(actual.includes(file), `Missing migration: ${file}`);
      }

      const checklist = readRepoFile('docs/engineering/deployment-checklist.md');
      for (const file of expected) {
        assert.ok(checklist.includes(file), `Checklist missing migration: ${file}`);
      }
    });
  });
});
