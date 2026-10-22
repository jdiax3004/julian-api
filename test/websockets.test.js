const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
const test = require('node:test');
const { WebSocket } = require('ws');
const { createWebSocketServers } = require('../websockets');

async function startServer(t, options) {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('HTTP still works');
  });
  const { echoServer, realtimeServer } = createWebSocketServers(server, options);
  const clients = new Set();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = `127.0.0.1:${server.address().port}`;

  t.after(async () => {
    const closed = [once(echoServer, 'close'), once(realtimeServer, 'close')];
    for (const client of clients) client.terminate();
    for (const client of echoServer.clients) client.terminate();
    for (const client of realtimeServer.clients) client.terminate();
    await Promise.all([...closed, new Promise((resolve) => server.close(resolve))]);
  });

  return {
    echoServer,
    realtimeServer,
    async connect(path = '/websocket', clientOptions) {
      const client = new WebSocket(`ws://${address}${path}`, clientOptions);
      clients.add(client);
      // A failed handshake or a test failure must not leave an unhandled error.
      client.on('error', () => {});
      await once(client, 'open');
      return client;
    },
    get(path, headers) {
      return new Promise((resolve, reject) => {
        const request = http.get(`http://${address}${path}`, { headers }, (response) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('error', reject);
          response.on('end', () => resolve({
            status: response.statusCode,
            body: Buffer.concat(chunks).toString(),
          }));
        });
        request.on('error', reject);
        request.on('upgrade', (_response, socket) => {
          socket.destroy();
          reject(new Error('Unexpected successful WebSocket upgrade'));
        });
      });
    },
  };
}

async function assertEcho(client, payload, binary = false) {
  const message = once(client, 'message');
  client.send(payload, { binary });
  const [received, isBinary] = await message;
  assert.deepEqual(received, Buffer.from(payload));
  assert.equal(isBinary, binary);
  assert.equal(client.readyState, WebSocket.OPEN);
}

test('echoes repeated text, Unicode, JSON, and empty messages over one connection', { timeout: 5000 }, async (t) => {
  const server = await startServer(t);
  const client = await server.connect();
  for (const payload of ['hello', 'hello', 'Hola 🌎 — こんにちは', '{ "message": "hello", "n": 1 }', '']) {
    await assertEcho(client, payload);
  }
});

test('preserves binary bytes and empty binary frames, including with a query string', { timeout: 5000 }, async (t) => {
  const server = await startServer(t);
  const client = await server.connect('/websocket?test=echo&value=%2Fws');
  await assertEcho(client, Buffer.from([0, 255, 128, 1, 10, 13]), true);
  await assertEcho(client, Buffer.alloc(0), true);
});

test('keeps an idle responsive client open through multiple heartbeat cycles', { timeout: 5000 }, async (t) => {
  const server = await startServer(t, { heartbeatIntervalMs: 50 });
  const client = await server.connect();
  const messages = [];
  client.on('message', (message) => messages.push(message));
  for (let cycle = 0; cycle < 3; cycle += 1) await once(client, 'ping');
  assert.equal(messages.length, 0, 'heartbeats must not create application messages');
  await assertEcho(client, 'still connected');
});

test('removes a client that does not answer heartbeat pings', { timeout: 5000 }, async (t) => {
  const server = await startServer(t, { heartbeatIntervalMs: 50 });
  const connection = once(server.echoServer, 'connection');
  const client = await server.connect('/websocket', { autoPong: false });
  const [peer] = await connection;
  const serverClosed = once(peer, 'close');
  const [code] = await once(client, 'close');
  await serverClosed;
  assert.equal(code, 1006);
  assert.equal(server.echoServer.clients.size, 0);
});

test('echoes each message only to the client that sent it', { timeout: 5000 }, async (t) => {
  const server = await startServer(t);
  const first = await server.connect();
  const second = await server.connect();
  await Promise.all([
    assertEcho(first, 'first client'),
    assertEcho(second, 'second client'),
  ]);
  await Promise.all([
    assertEcho(first, 'first client again'),
    assertEcho(second, 'second client again'),
  ]);
});

test('routes the legacy /ws endpoint independently and preserves its query string', { timeout: 5000 }, async (t) => {
  const server = await startServer(t);
  server.realtimeServer.on('connection', (client, request) => {
    client.on('message', () => client.send(request.url));
  });
  const client = await server.connect('/ws?channel=legacy');
  const message = once(client, 'message');
  client.send('request path');
  const [received, binary] = await message;
  assert.equal(received.toString(), '/ws?channel=legacy');
  assert.equal(binary, false);
  assert.equal(server.realtimeServer.clients.size, 1);
  assert.equal(server.echoServer.clients.size, 0);
});

test('rejects unknown upgrade paths with HTTP 404', { timeout: 5000 }, async (t) => {
  const server = await startServer(t);
  const headers = {
    Connection: 'Upgrade',
    Upgrade: 'websocket',
    'Sec-WebSocket-Version': '13',
    'Sec-WebSocket-Key': Buffer.alloc(16).toString('base64'),
  };
  for (const path of ['/unknown', '/websocket/', '/websocket-other', '/ws/']) {
    assert.equal((await server.get(path, headers)).status, 404, path);
  }
});

test('serves ordinary HTTP requests while a WebSocket connection is open', { timeout: 5000 }, async (t) => {
  const server = await startServer(t);
  const client = await server.connect();
  assert.deepEqual(await server.get('/health'), { status: 200, body: 'HTTP still works' });
  await assertEcho(client, 'after HTTP');
});

test('echoes a 1 MiB message and closes oversized messages with code 1009', { timeout: 5000 }, async (t) => {
  const server = await startServer(t);
  const client = await server.connect();
  await assertEcho(client, Buffer.alloc(1024 * 1024, 7), true);
  const closed = once(client, 'close');
  client.send(Buffer.alloc(1024 * 1024 + 1));
  const [code] = await closed;
  assert.equal(code, 1009);
});
