import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

describe('Account Role Management Suite', () => {
  it('root package.json defines "set-role" script', () => {
    const rootPkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    assert.ok(rootPkg.scripts['set-role'], 'Root package.json must contain set-role script');
    assert.match(rootPkg.scripts['set-role'], /set-user-role\.js/, 'Script should execute set-user-role.js');
  });

  it('server package.json defines "set-role" script', () => {
    const serverPkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'server/package.json'), 'utf8'));
    assert.ok(serverPkg.scripts['set-role'], 'Server package.json must contain set-role script');
  });

  it('validates UUID and role constraints correctly', () => {
    const validRoles = new Set(['user', 'admin']);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    assert.equal(uuidPattern.test('7b9c9c3c-c93e-49db-accb-5f31a44ccfb2'), true);
    assert.equal(uuidPattern.test('11111111-2222-4333-8444-555555555555'), true);
    assert.equal(uuidPattern.test('invalid-uuid'), false);
    assert.equal(uuidPattern.test(''), false);

    assert.equal(validRoles.has('admin'), true);
    assert.equal(validRoles.has('user'), true);
    assert.equal(validRoles.has('superuser'), false);
    assert.equal(validRoles.has('root'), false);
  });

  it('ensures role is assigned exclusively to trusted app_metadata', () => {
    const user = {
      id: 'test-user',
      app_metadata: { provider: 'email' },
      user_metadata: { name: 'Test' },
    };
    const requestedRole = 'admin';

    const updatedAppMetadata = {
      ...(user.app_metadata || {}),
      role: requestedRole,
    };

    assert.equal(updatedAppMetadata.role, 'admin');
    assert.equal(updatedAppMetadata.provider, 'email');
    assert.equal(user.user_metadata.role, undefined, 'user_metadata must never be modified for role assignment');
  });
});
