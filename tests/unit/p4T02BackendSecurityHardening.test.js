import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from '../../server/node_modules/express/index.js';
import cors from '../../server/node_modules/cors/lib/index.js';
import { PostgrestClient } from '../../server/node_modules/@supabase/postgrest-js/dist/index.mjs';
import {
  createCorsOptions,
  createHealthHandler,
  resolveRateLimitKey,
  resolveTrustProxy,
} from '../../server/src/shared/middleware/index.js';
import {
  encodePostgrestIlikeTerm,
  queryTransactionsPage,
  setExpenseClientFactoryForTests,
} from '../../server/src/features/transaction/transaction.repository.js';

async function withServer(app, fn) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('P4-T02 Backend Security & Query Hardening Suite', () => {
  describe('1. F4-01 Trusted Proxy & Rate-Limit Key Isolation', () => {
    it('resolves distinct client IPs behind trusted proxy in production and never enables blind trust=true', async () => {
      assert.notEqual(resolveTrustProxy({ trustProxyEnv: 'true' }), true);
      assert.equal(resolveTrustProxy({ nodeEnv: 'development' }), false);

      const app = express();
      app.set('trust proxy', resolveTrustProxy({ nodeEnv: 'production' }));
      app.get('/whoami', (req, res) => {
        res.json({ ip: req.ip, key: resolveRateLimitKey(req) });
      });

      await withServer(app, async (baseUrl) => {
        const r1 = await fetch(`${baseUrl}/whoami`, { headers: { 'X-Forwarded-For': '203.0.113.10' } }).then((r) => r.json());
        const r2 = await fetch(`${baseUrl}/whoami`, { headers: { 'X-Forwarded-For': '203.0.113.20' } }).then((r) => r.json());
        assert.equal(r1.ip, '203.0.113.10');
        assert.equal(r2.ip, '203.0.113.20');
        assert.notEqual(r1.key, r2.key);
      });
    });

    it('ignores spoofed X-Forwarded-For headers when trust proxy is disabled (direct non-proxied mode)', async () => {
      const app = express();
      app.set('trust proxy', resolveTrustProxy({ nodeEnv: 'development' }));
      app.get('/whoami', (req, res) => {
        res.json({ ip: req.ip });
      });

      await withServer(app, async (baseUrl) => {
        const r = await fetch(`${baseUrl}/whoami`, { headers: { 'X-Forwarded-For': '198.51.100.99' } }).then((res) => res.json());
        assert.notEqual(r.ip, '198.51.100.99');
      });
    });
  });

  describe('2. F4-01 CORS Origin Allowlist', () => {
    it('allows configured origin, rejects unauthorized origin, and never enables credentials with wildcard', async () => {
      let warned = false;
      const missingApp = express();
      missingApp.use(cors(createCorsOptions({
        corsOrigin: '',
        nodeEnv: 'production',
        onMissingProdConfig: () => { warned = true; },
      })));
      missingApp.get('/ping', (_req, res) => res.json({ ok: true }));
      assert.equal(warned, true);

      await withServer(missingApp, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/ping`, { headers: { Origin: 'https://evil.example.com' } });
        assert.equal(res.headers.get('access-control-allow-origin'), null);
      });

      const prodApp = express();
      prodApp.use(cors(createCorsOptions({
        corsOrigin: 'https://app.spendwise.test, *',
        nodeEnv: 'production',
      })));
      prodApp.get('/ping', (_req, res) => res.json({ ok: true }));

      await withServer(prodApp, async (baseUrl) => {
        const okRes = await fetch(`${baseUrl}/ping`, { headers: { Origin: 'https://app.spendwise.test' } });
        assert.equal(okRes.headers.get('access-control-allow-origin'), 'https://app.spendwise.test');
        assert.equal(okRes.headers.get('access-control-allow-credentials'), null);

        const badRes = await fetch(`${baseUrl}/ping`, { headers: { Origin: 'https://evil.example.com' } });
        assert.equal(badRes.headers.get('access-control-allow-origin'), null);
      });

      const devApp = express();
      devApp.use(cors(createCorsOptions({ corsOrigin: '', nodeEnv: 'development' })));
      devApp.get('/ping', (_req, res) => res.json({ ok: true }));

      await withServer(devApp, async (baseUrl) => {
        const devOk = await fetch(`${baseUrl}/ping`, { headers: { Origin: 'http://localhost:5173' } });
        assert.equal(devOk.headers.get('access-control-allow-origin'), 'http://localhost:5173');
        const devBad = await fetch(`${baseUrl}/ping`, { headers: { Origin: 'https://evil.example.com' } });
        assert.equal(devBad.headers.get('access-control-allow-origin'), null);
      });
    });
  });

  describe('3. F4-02 PostgREST .or() Filter Hardening', () => {
    /** Splits a PostgREST `.or()` expression at top-level commas outside `"..."` literals. */
    function splitTopLevelPredicates(expr) {
      const predicates = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < expr.length; i++) {
        const ch = expr[i];
        if (inQuotes) {
          if (ch === '\\' && i + 1 < expr.length) {
            current += ch + expr[i + 1];
            i++;
            continue;
          }
          if (ch === '"') inQuotes = false;
          current += ch;
        } else {
          if (ch === '"') {
            inQuotes = true;
            current += ch;
          } else if (ch === ',') {
            predicates.push(current);
            current = '';
          } else {
            current += ch;
          }
        }
      }
      assert.equal(inQuotes, false, `Unclosed quote in PostgREST expression: ${expr}`);
      if (current) predicates.push(current);
      return predicates;
    }

    it('enforces two-predicate .or() structure and escapes Layer A + Layer B metacharacters across all edge cases', async (t) => {
      const capturedOr = [];
      setExpenseClientFactoryForTests(() => ({
        from: () => ({
          select: () => ({
            eq() { return this; },
            gte() { return this; },
            lte() { return this; },
            or(expr) { capturedOr.push(expr); return this; },
            order() { return this; },
            range: async () => ({ data: [], count: 0, error: null }),
          }),
        }),
      }));
      t.after(() => setExpenseClientFactoryForTests(null));

      const user = { id: 'u1', token: 't1' };
      const baseQuery = { page: 1, pageSize: 10, sortBy: 'date', sortOrder: 'desc' };

      // Empty and whitespace-only inputs must omit `.or()` completely
      await queryTransactionsPage(user, { ...baseQuery, search: '' });
      await queryTransactionsPage(user, { ...baseQuery, search: '   \t\n  ' });
      assert.equal(capturedOr.length, 0);
      assert.equal(encodePostgrestIlikeTerm(''), '');
      assert.equal(encodePostgrestIlikeTerm('   '), '');

      const cases = [
        {
          name: 'normal ASCII search term',
          input: 'Highlands',
          expectedTerm: '"%Highlands%"',
        },
        {
          name: 'commas and nested parentheses',
          input: 'a,(b,(c)),d',
          expectedTerm: '"%a,(b,(c)),d%"',
        },
        {
          name: 'double quotes',
          input: 'foo"bar"',
          expectedTerm: '"%foo\\"bar\\"%"',
        },
        {
          name: 'single backslash',
          input: 'a\\b',
          expectedTerm: '"%a\\\\\\\\b%"',
        },
        {
          name: 'repeated backslashes',
          input: 'a\\\\b',
          expectedTerm: '"%a\\\\\\\\\\\\\\\\b%"',
        },
        {
          name: 'SQL ILIKE wildcards % and _',
          input: '100%_off',
          expectedTerm: '"%100\\\\%\\\\_off%"',
        },
        {
          name: 'PostgREST asterisk wildcard alias *',
          input: '5*hotel*',
          expectedTerm: '"%5\\\\*hotel\\\\*%"',
        },
        {
          name: 'combined reserved characters',
          input: 'a,b.(c:d)"e"\\f%g_h*i',
          expectedTerm: '"%a,b.(c:d)\\"e\\"\\\\\\\\f\\\\%g\\\\_h\\\\*i%"',
        },
        {
          name: 'adversarial predicate injection attempt',
          input: '",user_id.neq.00000000-0000-0000-0000-000000000000,or(merchant.ilike."*',
          expectedTerm: '"%\\",user\\\\_id.neq.00000000-0000-0000-0000-000000000000,or(merchant.ilike.\\"\\\\*%"',
        },
        {
          name: 'Unicode and Vietnamese text',
          input: 'Cà phê sữa đá (Q1)',
          expectedTerm: '"%Cà phê sữa đá (Q1)%"',
        },
      ];

      for (const tc of cases) {
        const prevLen = capturedOr.length;
        await queryTransactionsPage(user, { ...baseQuery, search: tc.input });
        assert.equal(capturedOr.length, prevLen + 1, `Expected .or() call for: ${tc.name}`);

        const expr = capturedOr[capturedOr.length - 1];
        const expectedExpr = `merchant.ilike.${tc.expectedTerm},note.ilike.${tc.expectedTerm}`;
        assert.equal(expr, expectedExpr, `Exact .or() mismatch for: ${tc.name}`);

        const predicates = splitTopLevelPredicates(expr);
        assert.equal(predicates.length, 2, `Expected exactly 2 predicates for: ${tc.name}`);
        assert.ok(predicates[0].startsWith('merchant.ilike."%'), `Predicate 0 column/op altered for: ${tc.name}`);
        assert.ok(predicates[1].startsWith('note.ilike."%'), `Predicate 1 column/op altered for: ${tc.name}`);

        // Verify no unescaped wildcard characters remain inside the inner payload
        const inner = tc.expectedTerm.slice(2, -2); // strip `"%` and `%"`
        assert.equal(/(?<!\\)[%_*]/.test(inner), false, `Unescaped wildcard found in inner payload for: ${tc.name}`);
      }
    });

    it('serializes the exact two-predicate or=(...) query parameter through real PostgrestClient', async (t) => {
      const capturedUrls = [];
      const pgClient = new PostgrestClient('https://example.supabase.co/rest/v1', {
        fetch: async (url) => {
          capturedUrls.push(String(url));
          return new Response('[]', {
            status: 200,
            headers: { 'content-type': 'application/json', 'content-range': '0-0/0' },
          });
        },
      });
      setExpenseClientFactoryForTests(() => pgClient);
      t.after(() => setExpenseClientFactoryForTests(null));

      const user = { id: 'u1', token: 't1' };
      const baseQuery = { page: 1, pageSize: 10, sortBy: 'date', sortOrder: 'desc' };

      const inputs = [
        'Highlands',
        '100%_off',
        '5*hotel*',
        'C:\\Reports',
        'foo"bar',
        'a,(b,(c)),d',
        'Cà phê sữa đá (Q1)',
      ];

      for (const search of inputs) {
        await queryTransactionsPage(user, { ...baseQuery, search });
        const url = new URL(capturedUrls[capturedUrls.length - 1]);
        const orParam = url.searchParams.get('or');
        const expectedTerm = encodePostgrestIlikeTerm(search);
        assert.equal(orParam, `(merchant.ilike.${expectedTerm},note.ilike.${expectedTerm})`);

        const innerOr = orParam.slice(1, -1);
        const predicates = splitTopLevelPredicates(innerOr);
        assert.equal(predicates.length, 2);
        assert.ok(predicates[0].startsWith('merchant.ilike."%'));
        assert.ok(predicates[1].startsWith('note.ilike."%'));
      }
    });
  });

  describe('4. F4-07 /api/health Error Disclosure', () => {
    it('masks internal error details in production while preserving diagnostics in development and healthy responses', async () => {
      const prodApp = express();
      prodApp.get('/api/health', createHealthHandler({
        getVectorStoreCount: async () => { throw new Error('ECONNREFUSED https://secret-cluster.qdrant.io:6333'); },
        nodeEnv: 'production',
      }));

      await withServer(prodApp, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/health`);
        assert.equal(res.status, 500);
        const body = await res.json();
        assert.equal(body.status, 'error');
        assert.equal(body.detail, 'Health check dependency unavailable.');
        assert.ok(!JSON.stringify(body).includes('secret-cluster.qdrant.io'));
      });

      const devApp = express();
      devApp.get('/api/health', createHealthHandler({
        getVectorStoreCount: async () => { throw new Error('Qdrant timeout'); },
        nodeEnv: 'development',
      }));

      await withServer(devApp, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/health`);
        assert.equal(res.status, 500);
        const body = await res.json();
        assert.equal(body.detail, 'Qdrant timeout');
      });

      const okApp = express();
      okApp.get('/api/health', createHealthHandler({
        getVectorStoreCount: async () => 12,
        nodeEnv: 'production',
      }));

      await withServer(okApp, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/health`);
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { status: 'ok', indexedChunks: 12 });
      });
    });
  });
});
