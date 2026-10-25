import assert from 'node:assert/strict';
import { test } from 'node:test';

// Deterministic local model of the documented SQL lifecycle; remote SQL/RLS is
// separately gated by the disposable-project harness.
class LeaseReceipt {
  constructor(now = 0) {
    this.status = 'uploaded';
    this.attempts = 0;
    this.started = null;
    this.token = null;
    this.now = now;
    this.storageCalls = 0;
  }

  start() {
    if (this.status === 'processing' && this.now - this.started < 600_000) {
      throw new Error('already processing');
    }
    if (this.status === 'processing') {
      this.status = 'failed';
      this.token = null;
    }
    if (!['uploaded', 'failed', 'review_required'].includes(this.status) || this.attempts >= 5) {
      throw new Error('cannot be processed');
    }
    this.status = 'processing';
    this.attempts++;
    this.started = this.now;
    this.token = `lease-${this.attempts}`;
    return this.token;
  }

  complete(token) {
    if (this.status !== 'processing' || token !== this.token) {
      throw new Error('stale lease');
    }
    this.status = 'review_required';
  }

  fail(token) {
    if (this.status !== 'processing' || token !== this.token) {
      throw new Error('stale lease');
    }
    this.status = 'failed';
  }

  remove() {
    if (this.status === 'processing' && this.now - this.started < 600_000) {
      throw new Error('actively processing');
    }
    if (this.status === 'processing') {
      this.status = 'failed';
      this.token = null;
    }
    this.storageCalls++;
    this.status = 'deleted';
  }
}

test('lease lifecycle admits one concurrent start and rejects active deletion before storage', async () => {
  const r = new LeaseReceipt();
  const [a, b] = await Promise.allSettled([
    Promise.resolve().then(() => r.start()),
    Promise.resolve().then(() => r.start()),
  ]);

  assert.equal([a, b].filter((x) => x.status === 'fulfilled').length, 1);
  assert.throws(() => r.remove(), /actively processing/);
  assert.equal(r.storageCalls, 0);
});

test('only stale leases reclaim, old worker tokens cannot complete or fail, and attempts cap cleanly', () => {
  const r = new LeaseReceipt();
  const old = r.start();
  r.now = 599_999;
  assert.throws(() => r.start(), /already processing/);

  r.now = 600_000;
  const current = r.start();
  assert.notEqual(old, current);
  assert.throws(() => r.complete(old), /stale lease/);
  assert.throws(() => r.fail(old), /stale lease/);
  r.fail(current);

  while (r.attempts < 5) {
    const token = r.start();
    r.fail(token);
  }
  assert.equal(r.attempts, 5);
  assert.throws(() => r.start(), /cannot be processed/);
});
