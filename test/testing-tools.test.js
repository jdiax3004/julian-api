const assert = require('node:assert/strict');
const { once, EventEmitter } = require('node:events');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const test = require('node:test');
const express = require('express');
const { sealSchema, decryptSchema, validateEnvelope } = require('../lib/testing-tools-crypto');
const { createTestingToolsRouter } = require('../routes/testing-tools');
const { hiddenPrompt } = require('../scripts/seal-testing-tools');

const runFile = promisify(execFile);
const PASSPHRASE = '  fictitious test secret only 12345  ';
const SCHEMA = { version: 1, headers: [{ name: 'X-Test-Example', values: ['example-only'] }] };
const sealedFixture = sealSchema(SCHEMA, PASSPHRASE);

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'testing-tools-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

async function startServer(t, options = {}) {
  const directory = await temporaryDirectory(t);
  const bundlePath = path.join(directory, 'bundle.json');
  await fs.writeFile(bundlePath, JSON.stringify(await sealedFixture));
  const app = express();
  app.set('trust proxy', true); // Deliberately unsafe setting must not bypass limits.
  let downstream = 0;
  app.use('/api/testing-tools', createTestingToolsRouter({ bundlePath, ...options }));
  app.use((_req, res) => { downstream += 1; res.set('Access-Control-Allow-Origin', '*').sendStatus(200); });
  const server = http.createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    bundlePath,
    downstream: () => downstream,
    request({ body = { passphrase: PASSPHRASE }, method = 'POST', route = '/unlock', headers = {} } = {}) {
      return new Promise((resolve, reject) => {
        const data = typeof body === 'string' ? body : JSON.stringify(body);
        const request = http.request({
          hostname: '127.0.0.1', port: server.address().port,
          path: `/api/testing-tools${route}`, method,
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
        }, (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('error', reject);
          response.on('end', () => {
            const raw = Buffer.concat(chunks).toString();
            resolve({ status: response.statusCode, headers: response.headers, raw, body: raw ? JSON.parse(raw) : undefined });
          });
        });
        request.on('error', reject);
        request.end(data);
      });
    },
  };
}

test('encrypts the schema with randomized salt/IV and preserves passphrase whitespace', async () => {
  const envelope = await sealedFixture;
  const second = await sealSchema(SCHEMA, PASSPHRASE);
  assert.notEqual(second.salt, envelope.salt);
  assert.notEqual(second.iv, envelope.iv);
  assert.notEqual(second.ciphertext, envelope.ciphertext);
  assert.equal(JSON.stringify(envelope).includes('X-Test-Example'), false);
  assert.deepEqual(await decryptSchema(envelope, PASSPHRASE), SCHEMA);
  await assert.rejects(decryptSchema(envelope, PASSPHRASE.trim()), { message: 'Unable to unlock testing tools.' });
});

test('rejects wrong passphrases, authenticated ciphertext tampering, and unsafe KDF parameters', async () => {
  const envelope = await sealedFixture;
  await assert.rejects(decryptSchema(envelope, 'wrong secret'), { message: 'Unable to unlock testing tools.' });
  const tampered = structuredClone(envelope);
  const ciphertext = Buffer.from(tampered.ciphertext, 'base64');
  ciphertext[0] ^= 1;
  tampered.ciphertext = ciphertext.toString('base64');
  await assert.rejects(decryptSchema(tampered, PASSPHRASE), { message: 'Unable to unlock testing tools.' });
  for (const invalid of [
    { ...envelope, kdf: { ...envelope.kdf, N: 1073741824 } },
    { ...envelope, iv: 'A'.repeat(100000) },
    { ...envelope, salt: 'not base64' },
    { ...envelope, tag: envelope.tag.replace(/.$/, '!') },
    { ...envelope, ciphertext: 'a' },
    { ...envelope, algorithm: 'aes-256-cbc' },
    { ...envelope, unknown: 'field' },
  ]) assert.throws(() => validateEnvelope(invalid), { message: 'Unable to unlock testing tools.' });
});

test('requires a sufficiently long secret when sealing and never echoes invalid input', async () => {
  await assert.rejects(sealSchema(SCHEMA, 'short'), (error) => !error.message.includes('short'));
  await assert.rejects(sealSchema([], PASSPHRASE));
  await assert.rejects(sealSchema({ tooLarge: 'x'.repeat(128 * 1024) }, PASSPHRASE));
});

test('only a correct passphrase returns the schema, with no cache, cookies, or CORS access', async (t) => {
  const server = await startServer(t);
  const denied = await server.request({ body: { passphrase: 'deliberately incorrect' } });
  assert.equal(denied.status, 401);
  assert.deepEqual(denied.body, { error: 'Unable to unlock testing tools.' });
  const result = await server.request({ headers: { Origin: 'https://untrusted.example' } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { schema: SCHEMA, expiresIn: 900 });
  for (const response of [denied, result]) {
    assert.match(response.headers['cache-control'], /no-store/);
    assert.equal(response.headers['surrogate-control'], 'no-store');
    assert.equal(response.headers['access-control-allow-origin'], undefined);
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(response.raw.includes(PASSPHRASE), false);
  }
  assert.equal(server.downstream(), 0);
});

test('missing, malformed, and oversized encrypted configuration fail closed', async (t) => {
  const server = await startServer(t, { perPeerAttempts: 10 });
  for (const contents of [null, '{invalid json', '{}', 'x'.repeat(190 * 1024)]) {
    if (contents === null) await fs.unlink(server.bundlePath);
    else await fs.writeFile(server.bundlePath, contents);
    const result = await server.request();
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { error: 'Testing tools are unavailable.' });
    assert.equal(result.raw.includes(server.bundlePath), false);
    assert.match(result.headers['cache-control'], /no-store/);
  }
  assert.equal(server.downstream(), 0);
});

test('bounds JSON size, rejects malformed bodies and form requests without echoing the secret', async (t) => {
  const server = await startServer(t, { perPeerAttempts: 20 });
  const examples = [
    [{ body: `{"passphrase":"${PASSPHRASE}"`, }, 400],
    [{ body: { passphrase: 'x'.repeat(3000) } }, 413],
    [{ body: { passphrase: PASSPHRASE, extra: true } }, 400],
    [{ body: { passphrase: 123 } }, 400],
    [{ body: {} }, 400],
    [{ body: { passphrase: '' } }, 400],
    [{ headers: { 'Content-Type': 'text/plain' } }, 415],
    [{ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 415],
  ];
  for (const [options, status] of examples) {
    const response = await server.request(options);
    assert.equal(response.status, status);
    assert.equal(response.raw.includes(PASSPHRASE), false);
    assert.equal(response.raw.includes('SyntaxError'), false);
  }
  assert.equal(server.downstream(), 0);
});

test('all methods and subroutes are terminal before downstream samplers and CORS', async (t) => {
  const server = await startServer(t);
  for (const method of ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await server.request({ method });
    assert.equal(response.status, 405);
    assert.equal(response.headers.allow, 'POST');
    assert.equal(response.headers['access-control-allow-origin'], undefined);
    assert.match(response.headers['cache-control'], /no-store/);
  }
  for (const route of ['', '/schema', '/unlock/', '/unknown/nested', '/UNLOCK']) {
    assert.equal((await server.request({ route })).status, 404);
  }
  assert.equal(server.downstream(), 0);
});

test('throttles by the socket peer before parsing and ignores spoofed forwarding headers', async (t) => {
  let clock = 1000;
  const server = await startServer(t, { now: () => clock, windowMs: 10000, perPeerAttempts: 2, decrypt: async () => SCHEMA });
  assert.equal((await server.request()).status, 200);
  assert.equal((await server.request({ body: '{invalid' })).status, 400);
  const limited = await server.request({ headers: { 'X-Forwarded-For': '198.51.100.12', Forwarded: 'for=198.51.100.12' } });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['retry-after'], '10');
  clock += 10001;
  assert.equal((await server.request()).status, 200);
});

test('enforces the global attempt budget independently of the peer allowance', async (t) => {
  const server = await startServer(t, { perPeerAttempts: 10, globalAttempts: 1, decrypt: async () => SCHEMA });
  assert.equal((await server.request()).status, 200);
  assert.equal((await server.request()).status, 429);
});

test('caps concurrent decrypts and releases the slot after a failed attempt', async (t) => {
  let release;
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const server = await startServer(t, {
    maxConcurrentDecrypts: 1,
    decrypt: async () => {
      calls += 1;
      if (calls === 1) { entered(); await blocked; throw new Error('internal error with secret must be suppressed'); }
      return SCHEMA;
    },
  });
  const first = server.request();
  await started;
  const second = await server.request();
  assert.equal(second.status, 429);
  assert.equal(second.headers['retry-after'], '2');
  release();
  assert.equal((await first).status, 401);
  assert.equal((await server.request()).status, 200);
});

test('hidden passphrase entry does not echo or trim input and restores terminal state', async () => {
  const input = new EventEmitter();
  Object.assign(input, { isTTY: true, isRaw: false, resume() {}, pause() {}, setEncoding() {}, setRawMode(value) { this.isRaw = value; } });
  let output = '';
  const terminal = { isTTY: true, write(text) { output += text; } };
  const pending = hiddenPrompt('Hidden: ', input, terminal);
  assert.equal(input.isRaw, true);
  input.emit('data', `${PASSPHRASE}\r`);
  assert.equal(await pending, PASSPHRASE);
  assert.equal(output, 'Hidden: \n');
  assert.equal(input.isRaw, false);
  assert.equal(input.listenerCount('data'), 0);
  const cancelled = hiddenPrompt('Hidden: ', input, terminal);
  input.emit('data', 'never echo this\u0003');
  await assert.rejects(cancelled, { message: 'Cancelled.' });
  assert.equal(input.isRaw, false);
  assert.equal(output.includes('never echo'), false);
});

test('CLI generates an owner-only secret, seals successfully, and logs only paths', async (t) => {
  const directory = await temporaryDirectory(t);
  await fs.mkdir(path.join(directory, 'scripts'));
  await fs.mkdir(path.join(directory, 'lib'));
  await fs.mkdir(path.join(directory, '.private-testing-tools'));
  await fs.copyFile(path.join(__dirname, '../scripts/seal-testing-tools.js'), path.join(directory, 'scripts/seal-testing-tools.js'));
  await fs.copyFile(path.join(__dirname, '../lib/testing-tools-crypto.js'), path.join(directory, 'lib/testing-tools-crypto.js'));
  await fs.writeFile(path.join(directory, '.private-testing-tools/schema.json'), JSON.stringify(SCHEMA));
  const script = path.join(directory, 'scripts/seal-testing-tools.js');
  const result = await runFile(process.execPath, [script, '--generate']);
  const secretPath = path.join(directory, '.private-testing-tools/passphrase.txt');
  const passphrase = (await fs.readFile(secretPath, 'utf8')).replace(/\n$/, '');
  assert.equal(passphrase.length, 43);
  assert.equal((await fs.stat(secretPath)).mode & 0o777, 0o600);
  assert.equal(result.stdout.includes(passphrase), false);
  assert.equal(result.stdout.includes('X-Test-Example'), false);
  assert.equal(result.stderr, '');
  const bundle = JSON.parse(await fs.readFile(path.join(directory, 'config/testing-tools.enc.json'), 'utf8'));
  assert.deepEqual(await decryptSchema(bundle, passphrase), SCHEMA);
  await assert.rejects(runFile(process.execPath, [script, '--passphrase', PASSPHRASE]), (error) => {
    assert.equal(error.stdout.includes(PASSPHRASE), false);
    assert.equal(error.stderr.includes(PASSPHRASE), false);
    return true;
  });
  await assert.rejects(runFile(process.execPath, [script]), (error) => {
    assert.match(error.stderr, /terminal/);
    return true;
  });
});
