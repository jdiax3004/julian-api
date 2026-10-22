#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { sealSchema } = require('../lib/testing-tools-crypto');

const ROOT = path.join(__dirname, '..');
const PRIVATE = path.join(ROOT, '.private-testing-tools');
const BUNDLE = path.join(ROOT, 'config', 'testing-tools.enc.json');
const SECRET = path.join(PRIVATE, 'passphrase.txt');

function hiddenPrompt(label, input = process.stdin, output = process.stdout) {
  if (!input.isTTY || !output.isTTY) {
    throw new Error('Run this command in a terminal for hidden passphrase entry, or use --generate.');
  }
  return new Promise((resolve, reject) => {
    let value = '';
    const previousRaw = input.isRaw;
    output.write(label);
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.resume();
    function finish(error) {
      input.removeListener('data', onData);
      input.setRawMode(previousRaw);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
      value = '';
    }
    function onData(data) {
      for (const char of data) {
        if (char === '\u0003' || char === '\u0004') return finish(new Error('Cancelled.'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') value = [...value].slice(0, -1).join('');
        else if (char >= ' ' && char !== '\u001b') value += char;
        if (Buffer.byteLength(value, 'utf8') > 1024) return finish(new Error('Passphrase exceeds 1024 UTF-8 bytes.'));
      }
    }
    input.on('data', onData);
  });
}

async function writeAtomic(filename, contents, mode) {
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temp = `${filename}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    await fs.writeFile(temp, contents, { flag: 'wx', mode });
    await fs.rename(temp, filename);
  } finally {
    await fs.unlink(temp).catch(() => {});
  }
}

async function main() {
  const args = process.argv.slice(2);
  let source = path.join(PRIVATE, 'schema.json');
  let generate = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--generate' && !generate) generate = true;
    else if (args[index] === '--source' && args[index + 1] && !args[index + 1].startsWith('--')) source = path.resolve(args[++index]);
    else throw new Error('Usage: node scripts/seal-testing-tools.js [--generate] [--source path]');
  }
  let schema;
  try {
    schema = JSON.parse(await fs.readFile(source, 'utf8'));
  } catch {
    throw new Error('Cannot read the private JSON schema.');
  }
  let passphrase;
  let confirm;
  try {
    if (generate) passphrase = randomBytes(32).toString('base64url');
    else {
      passphrase = await hiddenPrompt('New passphrase (at least 20 characters; input hidden): ');
      confirm = await hiddenPrompt('Repeat passphrase (input hidden): ');
      if (passphrase !== confirm) throw new Error('Passphrases do not match.');
    }
    const bundle = await sealSchema(schema, passphrase);
    // The generated secret never enters argv, environment variables, or stdout.
    // Keep this file in the ignored private directory and out of deployments.
    if (generate) await writeAtomic(SECRET, `${passphrase}\n`, 0o600);
    await writeAtomic(BUNDLE, `${JSON.stringify(bundle, null, 2)}\n`, 0o644);
    process.stdout.write(`Encrypted bundle: ${BUNDLE}\n`);
    if (generate) process.stdout.write(`Private passphrase (mode 0600): ${SECRET}\n`);
  } finally {
    // JavaScript strings cannot be reliably wiped; retain no process-global
    // passphrase, and exit after writing the bundle. Crypto buffers are wiped.
    passphrase = undefined;
    confirm = undefined;
    schema = undefined;
  }
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

module.exports = { hiddenPrompt };
