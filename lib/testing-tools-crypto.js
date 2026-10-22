const { randomBytes, scrypt, createCipheriv, createDecipheriv } = require('node:crypto');
const { promisify } = require('node:util');

const derive = promisify(scrypt);
const KDF = Object.freeze({ name: 'scrypt', N: 32768, r: 8, p: 3 });
// OWASP's 32 MiB scrypt profile; p=3 compensates for the lower memory setting.
// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt
const SCRYPT_OPTIONS = Object.freeze({ N: KDF.N, r: KDF.r, p: KDF.p, maxmem: 64 * 1024 * 1024 });
const AAD = Buffer.from('julian-api/testing-tools/v1', 'utf8');
const MAX_SCHEMA_BYTES = 128 * 1024;
const MAX_BUNDLE_BYTES = 180 * 1024;
const UNLOCK_ERROR = 'Unable to unlock testing tools.';

function validPassphrase(passphrase) {
  return typeof passphrase === 'string' && passphrase.length > 0 && Buffer.byteLength(passphrase, 'utf8') <= 1024;
}

function validSchema(schema) {
  return schema !== null && typeof schema === 'object' && !Array.isArray(schema);
}

function decodeBase64(value, bytes) {
  const length = 4 * Math.ceil(bytes / 3);
  if (typeof value !== 'string' || value.length !== length || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(UNLOCK_ERROR);
  }
  const result = Buffer.from(value, 'base64');
  if (result.length !== bytes || result.toString('base64') !== value) throw new Error(UNLOCK_ERROR);
  return result;
}

function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
    || envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm'
    || !envelope.kdf || Object.keys(envelope.kdf).length !== 4
    || Object.entries(KDF).some(([key, value]) => envelope.kdf[key] !== value)
    || Object.keys(envelope).sort().join(',') !== 'algorithm,ciphertext,iv,kdf,salt,tag,version') {
    throw new Error(UNLOCK_ERROR);
  }
  decodeBase64(envelope.salt, 16);
  decodeBase64(envelope.iv, 12);
  decodeBase64(envelope.tag, 16);
  if (typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length < 4
    || envelope.ciphertext.length > 4 * Math.ceil(MAX_SCHEMA_BYTES / 3)
    || envelope.ciphertext.length % 4 !== 0
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.ciphertext)) {
    throw new Error(UNLOCK_ERROR);
  }
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  if (ciphertext.length > MAX_SCHEMA_BYTES || ciphertext.toString('base64') !== envelope.ciphertext) {
    throw new Error(UNLOCK_ERROR);
  }
  return envelope;
}

async function deriveKey(passphrase, salt) {
  const secret = Buffer.from(passphrase, 'utf8');
  try {
    return await derive(secret, salt, 32, SCRYPT_OPTIONS);
  } finally {
    secret.fill(0);
  }
}

async function sealSchema(schema, passphrase) {
  let key;
  let plaintext;
  try {
    if (!validSchema(schema) || !validPassphrase(passphrase) || [...passphrase].length < 20) {
      throw new Error('Invalid input.');
    }
    plaintext = Buffer.from(JSON.stringify(schema), 'utf8');
    if (plaintext.length > MAX_SCHEMA_BYTES) throw new Error('Schema too large.');
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    key = await deriveKey(passphrase, salt);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      version: 1,
      algorithm: 'aes-256-gcm',
      kdf: { ...KDF },
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
  } catch {
    throw new Error('Unable to seal testing tools. Check the source and use a passphrase of at least 20 characters (at most 1024 UTF-8 bytes).');
  } finally {
    if (key) key.fill(0);
    if (plaintext) plaintext.fill(0);
  }
}

async function decryptSchema(envelope, passphrase) {
  let key;
  let plaintext;
  let firstChunk;
  try {
    validateEnvelope(envelope);
    if (!validPassphrase(passphrase)) throw new Error(UNLOCK_ERROR);
    key = await deriveKey(passphrase, Buffer.from(envelope.salt, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    // update() may produce unauthenticated plaintext; wipe it even when final() fails.
    firstChunk = decipher.update(Buffer.from(envelope.ciphertext, 'base64'));
    plaintext = Buffer.concat([firstChunk, decipher.final()]);
    const schema = JSON.parse(plaintext.toString('utf8'));
    if (!validSchema(schema)) throw new Error(UNLOCK_ERROR);
    return schema;
  } catch {
    // Deliberately do not expose cryptographic, parser, or passphrase details.
    throw new Error(UNLOCK_ERROR);
  } finally {
    if (key) key.fill(0);
    if (plaintext) plaintext.fill(0);
    if (firstChunk) firstChunk.fill(0);
  }
}

module.exports = { sealSchema, decryptSchema, validateEnvelope, MAX_BUNDLE_BYTES };
