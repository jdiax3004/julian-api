'use strict';

const express = require('express');
const path = require('node:path');
const { createTestingToolsRouter } = require('../routes/testing-tools');

// Preview the UI and protected tool without starting the database or WebSockets.
// The frontend's login request still targets the configured public API.
const app = express();
app.disable('x-powered-by');
app.use('/api/testing-tools', createTestingToolsRouter());
app.use(express.static(path.join(__dirname, '..', 'frontend'), {
  setHeaders(res) { res.set('Cache-Control', 'no-store'); },
}));
const port = Number(process.env.PREVIEW_PORT || 8080);
app.listen(port, '127.0.0.1', () => {
  console.log(`Local preview: http://127.0.0.1:${port}`);
  console.log('Login requests still use the public API configured in frontend/script.js.');
});
