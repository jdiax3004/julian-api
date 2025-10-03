const express = require('express');
const dotenv = require('dotenv');
const sequelize = require('./config/database');
const cors = require('cors');
const expressOasGenerator = require('express-oas-generator');
const http = require('http');
const { WebSocketServer } = require('ws');
const WebSocket = require('ws');

dotenv.config();

const app = express();
expressOasGenerator.init(app, {}, './openapi.json', 5000);

// Enable CORS
app.use(cors());
app.use(express.json());

// Ensure database connection is established
sequelize.authenticate()
  .then(() => console.log('Connected to MySQL via Sequelize'))
  .catch(err => console.error('Failed to connect to MySQL:', err));

// Normal REST routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// ------------------------------------------------------------------
// WebSocket proxy to OpenAI Realtime
// ------------------------------------------------------------------
const server = http.createServer(app);              // shared HTTP + WS server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (client, req) => {
  console.log('✅ Browser connected to /ws');

  // 1. Read user-supplied OpenAI key from query string
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  const userKey = params.get('key');
  if (!userKey) {
    client.send(JSON.stringify({ type: 'error', error: { message: 'Missing OpenAI key' } }));
    client.close();
    return;
  }

  // 2. Connect to OpenAI Realtime using that key
  const model = 'gpt-5-realtime-preview';
  const upstream = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
    {
      headers: {
        Authorization: `Bearer ${userKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    }
  );

  const safeSend = (socket, data) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(data);
  };

  upstream.on('open', () => {
    console.log('🔗 Connected to OpenAI Realtime');
    // Optional: tell OpenAI we only need text
    safeSend(upstream, JSON.stringify({
      type: 'session.update',
      session: { modalities: ['text'] }
    }));
  });

  // Relay OpenAI → Browser
  upstream.on('message', (data) => safeSend(client, data));

  // Relay Browser → OpenAI
  client.on('message', (raw) => {
    let text = '';
    try {
      const p = JSON.parse(raw.toString());
      text = p.text ?? String(p);
    } catch {
      text = raw.toString();
    }

    const create = {
      type: 'response.create',
      response: {
        modalities: ['text'],
        input: [{ role: 'user', content: [{ type: 'input_text', text }] }]
      }
    };
    safeSend(upstream, JSON.stringify(create));
  });

  // Cleanup
  client.on('close', () => {
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
  });
  upstream.on('close', () => client.close());
  upstream.on('error', (err) => {
    console.error('OpenAI WS error:', err.message);
    safeSend(client, JSON.stringify({ type: 'error', error: { message: err.message } }));
    client.close();
  });
});

// ------------------------------------------------------------------
// Start combined server
// ------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`HTTP & WS server running on http://localhost:${PORT}`);
});
