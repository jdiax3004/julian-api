const { WebSocket, WebSocketServer } = require('ws');

function createWebSocketServers(server, { heartbeatIntervalMs = 30_000 } = {}) {
  const echoServer = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  const realtimeServer = new WebSocketServer({ noServer: true });

  // A single upgrade listener prevents one WS endpoint rejecting the other's requests.
  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url.split('?')[0];
    const target = pathname === '/websocket' ? echoServer
      : pathname === '/ws' ? realtimeServer : null;

    socket.on('error', () => socket.destroy());
    if (!target) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }

    target.handleUpgrade(request, socket, head, (client) => {
      target.emit('connection', client, request);
    });
  });

  echoServer.on('connection', (client) => {
    client.isAlive = true;
    client.on('pong', () => { client.isAlive = true; });
    client.on('error', (err) => console.error('Echo WS error:', err.message));

    client.on('message', (data, isBinary) => {
      if (client.readyState !== WebSocket.OPEN) return;
      // Preserve bytes and message type; add no prefix, JSON wrapper, or greeting.
      client.send(data, { binary: isBinary }, (err) => {
        if (err) client.terminate();
      });
    });
  });

  // Control frames keep the origin leg active without adding chat messages.
  const heartbeat = setInterval(() => {
    for (const client of echoServer.clients) {
      if (!client.isAlive) {
        client.terminate();
        continue;
      }
      if (client.readyState === WebSocket.OPEN) {
        client.isAlive = false;
        client.ping();
      }
    }
  }, heartbeatIntervalMs);
  heartbeat.unref();
  echoServer.on('close', () => clearInterval(heartbeat));

  server.on('close', () => {
    echoServer.close();
    realtimeServer.close();
  });

  return { echoServer, realtimeServer };
}

module.exports = { createWebSocketServers };
