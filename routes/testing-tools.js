const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');
const { decryptSchema, validateEnvelope, MAX_BUNDLE_BYTES } = require('../lib/testing-tools-crypto');

function createTestingToolsRouter({
  bundlePath = path.join(__dirname, '..', 'config', 'testing-tools.enc.json'),
  windowMs = 15 * 60 * 1000,
  perPeerAttempts = 5,
  globalAttempts = 30,
  maxConcurrentDecrypts = 2,
  maxPeers = 1000,
  now = Date.now,
  decrypt = decryptSchema,
} = {}) {
  const router = express.Router({ strict: true, caseSensitive: true });
  const peers = new Map();
  let globalWindow = { count: 0, until: 0 };
  let activeDecrypts = 0;
  const json = express.json({ limit: 2048, strict: true, inflate: false, type: 'application/json' });

  // Mount this router BEFORE CORS, JSON parsing, access/body loggers, and API
  // documentation sampling. Every route terminates here, including errors.
  router.use((_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store, private, max-age=0',
      'Surrogate-Control': 'no-store',
      Pragma: 'no-cache',
      Expires: '0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });

  function throttle(req, res, next) {
    const time = now();
    for (const [peer, budget] of peers) if (budget.until <= time) peers.delete(peer);
    if (globalWindow.until <= time) globalWindow = { count: 0, until: time + windowMs };
    // Never use req.ip, Forwarded, or X-Forwarded-For: they can be spoofed when
    // a proxy trust configuration is too broad. Shared proxy peers share a limit.
    const peer = req.socket.remoteAddress || 'unknown';
    let budget = peers.get(peer);
    if (!budget && peers.size < maxPeers) {
      budget = { count: 0, until: time + windowMs };
      peers.set(peer, budget);
    }
    if (!budget || budget.count >= perPeerAttempts || globalWindow.count >= globalAttempts) {
      const until = Math.max(globalWindow.count >= globalAttempts ? globalWindow.until : time, budget?.until || time + windowMs);
      res.set('Retry-After', String(Math.max(1, Math.ceil((until - time) / 1000))));
      return res.status(429).json({ error: 'Too many unlock attempts. Try again later.' });
    }
    budget.count += 1;
    globalWindow.count += 1;
    next();
  }

  router.post('/unlock', throttle, (req, res, next) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'A JSON request is required.' });
    // Browsers cannot submit this JSON POST cross-origin without a preflight;
    // this router intentionally grants no CORS access.
    json(req, res, (error) => {
      if (error) {
        req.body = undefined;
        return res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: 'Invalid unlock request.' });
      }
      next();
    });
  }, async (req, res) => {
    let passphrase = req.body?.passphrase;
    const validBody = req.body && Object.keys(req.body).length === 1 && typeof passphrase === 'string'
      && passphrase.length > 0 && Buffer.byteLength(passphrase, 'utf8') <= 1024;
    req.body = undefined;
    if (!validBody) return res.status(400).json({ error: 'Invalid unlock request.' });
    if (activeDecrypts >= maxConcurrentDecrypts) {
      passphrase = undefined;
      return res.set('Retry-After', '2').status(429).json({ error: 'Too many unlock attempts. Try again later.' });
    }

    activeDecrypts += 1;
    let handle;
    try {
      let envelope;
      try {
        handle = await fs.open(bundlePath, 'r');
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > MAX_BUNDLE_BYTES) throw new Error('Unavailable');
        const encrypted = await handle.readFile({ encoding: 'utf8' });
        if (Buffer.byteLength(encrypted, 'utf8') > MAX_BUNDLE_BYTES) throw new Error('Unavailable');
        envelope = validateEnvelope(JSON.parse(encrypted));
      } catch {
        return res.status(503).json({ error: 'Testing tools are unavailable.' });
      }
      let schema;
      try {
        schema = await decrypt(envelope, passphrase);
      } catch {
        return res.status(401).json({ error: 'Unable to unlock testing tools.' });
      }
      return res.json({ schema, expiresIn: 900 });
    } catch {
      if (!res.headersSent) return res.status(503).json({ error: 'Testing tools are unavailable.' });
    } finally {
      passphrase = undefined;
      activeDecrypts -= 1;
      if (handle) await handle.close().catch(() => {});
    }
  });

  router.all('/unlock', (_req, res) => res.set('Allow', 'POST').status(405).json({ error: 'Method not allowed.' }));
  router.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  // Never forward parser errors to Express's development error renderer or to
  // subsequent middleware that could record the request body.
  router.use((_error, req, res, _next) => {
    req.body = undefined;
    if (!res.headersSent) res.status(400).json({ error: 'Invalid unlock request.' });
  });
  return router;
}

module.exports = { createTestingToolsRouter };
