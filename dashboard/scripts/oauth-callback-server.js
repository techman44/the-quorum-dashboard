#!/usr/bin/env node

/**
 * OpenAI OAuth Callback Server
 *
 * This server handles OAuth callbacks from OpenAI's public OAuth client.
 * OpenAI's public OAuth client (app_EMoamEEZ73f0CkXaXp7hrann) only accepts
 * callbacks to http://127.0.0.1:1455, so this server runs on that port
 * and forwards the authorization code to the dashboard API.
 *
 * Usage: node scripts/oauth-callback-server.js
 */

const http = require('http');

const PORT = 1455;
const DASHBOARD_API = process.env.DASHBOARD_API_URL || 'http://localhost:3000';
const CALLBACK_PATH = '/auth/callback';

// HTML templates
const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Successful</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: #1e293b;
      border-radius: 16px;
      padding: 40px;
      max-width: 480px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      border: 1px solid #334155;
    }
    .icon {
      width: 64px;
      height: 64px;
      background: linear-gradient(135deg, #10a37f 0%, #1a7f64 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
    }
    .icon svg {
      width: 32px;
      height: 32px;
      color: white;
    }
    h1 {
      color: #f1f5f9;
      font-size: 24px;
      margin-bottom: 12px;
      font-weight: 600;
    }
    .message {
      color: #94a3b8;
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .details {
      background: #0f172a;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
      border: 1px solid #334155;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
    }
    .detail-label {
      color: #64748b;
    }
    .detail-value {
      color: #f1f5f9;
      font-weight: 500;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(16, 163, 127, 0.1);
      color: #10a37f;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 24px;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      background: #10a37f;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .instructions {
      text-align: left;
      background: #f1f5f9;
      border-radius: 8px;
      padding: 16px;
      margin-top: 24px;
    }
    .instructions h3 {
      color: #0f172a;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .instructions ol {
      color: #475569;
      font-size: 13px;
      padding-left: 20px;
      line-height: 1.8;
    }
    .instructions li {
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
    <h1>Authentication Successful!</h1>
    <div class="status">
      <span class="status-dot"></span>
      Connected to OpenAI
    </div>
    <p class="message">
      Your OpenAI account has been successfully connected. The dashboard has received your credentials and you can now use ChatGPT models.
    </p>
    <div class="details">
      <div class="detail-row">
        <span class="detail-label">Provider:</span>
        <span class="detail-value">OpenAI (ChatGPT)</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Status:</span>
        <span class="detail-value">Active</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Token Type:</span>
        <span class="detail-value">OAuth 2.0</span>
      </div>
    </div>
    <div class="instructions">
      <h3>Next Steps:</h3>
      <ol>
        <li>Return to the Quorum Dashboard</li>
        <li>You'll see your connected OpenAI account</li>
        <li>The provider is now ready to use</li>
        <li>You can close this window or tab</li>
      </ol>
    </div>
  </div>
</body>
</html>`;

const ERROR_HTML = (errorMessage) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authentication Error</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: #1e293b;
      border-radius: 16px;
      padding: 40px;
      max-width: 480px;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      border: 1px solid #334155;
    }
    .icon {
      width: 64px;
      height: 64px;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
    }
    .icon svg {
      width: 32px;
      height: 32px;
      color: white;
    }
    h1 {
      color: #f1f5f9;
      font-size: 24px;
      margin-bottom: 12px;
      font-weight: 600;
    }
    .message {
      color: #94a3b8;
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .error-box {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid #dc2626;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .error-title {
      color: #ef4444;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .error-message {
      color: #fca5a5;
      font-size: 13px;
      word-break: break-word;
    }
    .instructions {
      text-align: left;
      background: #f1f5f9;
      border-radius: 8px;
      padding: 16px;
    }
    .instructions h3 {
      color: #0f172a;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .instructions ol {
      color: #475569;
      font-size: 13px;
      padding-left: 20px;
      line-height: 1.8;
    }
    .instructions li {
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
    <h1>Authentication Failed</h1>
    <p class="message">
      There was a problem connecting your OpenAI account. Please try again.
    </p>
    <div class="error-box">
      <div class="error-title">Error Details:</div>
      <div class="error-message">${escapeHtml(errorMessage)}</div>
    </div>
    <div class="instructions">
      <h3>Troubleshooting:</h3>
      <ol>
        <li>Make sure the callback server is still running</li>
        <li>Check that the dashboard is running at ${DASHBOARD_API}</li>
        <li>Try the authorization process again</li>
        <li>If the problem persists, check the server console for details</li>
      </ol>
    </div>
  </div>
</body>
</html>`;

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

async function forwardToDashboard(code, state) {
  const url = new URL('/api/auth/openai/callback', DASHBOARD_API);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code, state }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.details || `HTTP ${response.status}`);
  }

  return response.json();
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  // Log incoming requests
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  // Handle OAuth callback
  if (parsedUrl.pathname === CALLBACK_PATH) {
    const code = parsedUrl.searchParams.get('code');
    const state = parsedUrl.searchParams.get('state');
    const error = parsedUrl.searchParams.get('error');
    const errorDescription = parsedUrl.searchParams.get('error_description');

    console.log('OAuth callback received:');
    console.log(`  Code present: ${!!code}`);
    console.log(`  State present: ${!!state}`);
    console.log(`  Error: ${error || 'none'}`);

    // Handle OAuth errors from OpenAI
    if (error) {
      console.error('OAuth error from OpenAI:', error, errorDescription);
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(ERROR_HTML(errorDescription || error));
      return;
    }

    // Validate required parameters
    if (!code || !state) {
      console.error('Missing required parameters');
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(ERROR_HTML('Missing required parameters (code or state)'));
      return;
    }

    // Forward to dashboard API
    try {
      console.log(`Forwarding to dashboard at ${DASHBOARD_API}...`);
      const result = await forwardToDashboard(code, state);
      console.log('Successfully forwarded to dashboard:', result);

      // Send success page
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(SUCCESS_HTML);
    } catch (err) {
      console.error('Error forwarding to dashboard:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(ERROR_HTML(err.message));
    }
    return;
  }

  // Handle health check
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      port: PORT
    }));
    return;
  }

  // 404 for other paths
  res.writeHead(404, { 'Content-Type': 'text/html' });
  res.end(`<html><body><h1>404 - Not Found</h1><p>The OAuth callback server is running on port ${PORT}, but this path is not available.</p><p>Expected callback path: <code>${CALLBACK_PATH}</code></p></body></html>`);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('=================================');
  console.log('  OpenAI OAuth Callback Server  ');
  console.log('=================================');
  console.log('');
  console.log(`Server running at: http://127.0.0.1:${PORT}`);
  console.log(`Callback endpoint: http://127.0.0.1:${PORT}${CALLBACK_PATH}`);
  console.log(`Dashboard API: ${DASHBOARD_API}`);
  console.log('');
  console.log('This server handles OAuth callbacks from OpenAI.');
  console.log('Keep this server running while authorizing your account.');
  console.log('');
  console.log('Press Ctrl+C to stop the server');
  console.log('=================================');
  console.log('');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down OAuth callback server...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
