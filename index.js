// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const url = require('url');
const path = require('path');
const rateLimit = require('express-rate-limit');

// Configuration
const app = express();
const port = process.env.PORT || 3000;
const serverSecret = process.env.SERVER_SECRET || "JSIUFJFJDKDKDKKkkskskskdkKksjjdjdjjJSISIDJSJJSJSJSIUFJFJDKDKDKKkkskskskdkKksjjdjdjjJSISIDJSJJSJS";
const clientIDHidden0 = "96b";
const clientIDHidden1 = "6ba2rtl1";
const clientIDHidden2 = "js5sal2";
const isDeveloper = false;

// Middleware Setup
app.set('trust proxy', 1);
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use('/api/', limiter);
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Server and WebSocket Setup
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = new Map();
const activeProcesses = new Map();
const clientProcessMap = new Map();
const allowedOrigin = ["https://spamshare.koyeb.app"];
if (isDeveloper) allowedOrigin.push('http://localhost:5173');

// API Endpoints
app.post('/api/check-process', async (req, res) => {
  const { clientSecret, clientId } = req.body;
  if (clientSecret !== serverSecret) return res.status(401).json({ error: 'Unauthorized' });
  
  const processId = clientProcessMap.get(clientId);
  if (processId && activeProcesses.has(processId)) {
    const processInfo = activeProcesses.get(processId);
    return res.json({
      processId,
      isPaused: processInfo.isPaused,
      sharedCount: processInfo.sharedCount,
      originalParams: processInfo.originalParams,
      logs: processInfo.logs || []
    });
  }
  
  if (processId) clientProcessMap.delete(clientId);
  res.json({ processId: null });
});

// WebSocket Connection Handler
wss.on('connection', (ws, req) => {
  const parsedUrl = url.parse(req.url, true);
  const clientId = parsedUrl.query.clientId;
  if (!clientId) return ws.close();

  const safeClientId = String(clientId).replace(/[^a-zA-Z0-9_-]/g, '');
  if (safeClientId !== clientId) {
    console.warn(`Potentially unsafe clientId: ${clientId}, using: ${safeClientId}`);
  }

  clients.set(safeClientId, ws);
  
  ws.on('close', () => clients.delete(safeClientId));
  ws.on('error', (error) => {
    console.error(`WebSocket error for client ${safeClientId}:`, error);
    clients.delete(safeClientId);
  });
  
  // Send existing logs if reconnecting
  for (const [processId, processInfo] of activeProcesses) {
    if (processInfo.clientId === safeClientId && processInfo.logs?.length > 0) {
      ws.send(JSON.stringify({
        type: "log-history",
        logs: processInfo.logs.slice(-50) // Send last 50 logs
      }));
      break;
    }
  }
});

// Helper Functions
function sendLogToClient(clientId, message, isError = false) {
  const client = clients.get(clientId);
  if (client?.readyState === WebSocket.OPEN) {
    const logEntry = { 
      message: isError ? `ERROR: ${message}` : message, 
      timestamp: Date.now() 
    };
    
    // Store log in active process
    for (const [processId, processInfo] of activeProcesses) {
      if (processInfo.clientId === clientId) {
        if (!processInfo.logs) processInfo.logs = [];
        processInfo.logs.push(logEntry);
        break;
      }
    }
    
    client.send(JSON.stringify({ 
      type: 'backend-log', 
      ...logEntry 
    }));
  }
}

function sendSuccessLog(clientId, message, details) {
  const client = clients.get(clientId);
  if (client?.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify({ 
      type: "success-shared", 
      message, 
      details,
      isFinal: true
    }));
  }
}

function sendErrorLog(clientId, message, details, isFinal = false) {
  const client = clients.get(clientId);
  if (client?.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify({ 
      type: "error-shared", 
      message, 
      details,
      isFinal 
    }));
  }
}

// Main Share Endpoint
app.post('/api/share', async (req, res) => {
  const { 
    facebookCache, 
    shareUrl, 
    shareCount, 
    timeInterval, 
    clientSecret, 
    clientIdX, 
    processId 
  } = req.body;
  
  let websiteOrigin = req.headers.origin;
  if (!allowedOrigin.includes(websiteOrigin)) {
    return res.status(400).json({ error: 'Unauthorized origin' });
  }
  
  // Validate client ID
  let clientId;
  try {
    const clientIdParts = clientIdX.split('-');
    const lastPart = clientIdParts.pop();
    if (clientIdParts[0] !== clientIDHidden0 || 
        clientIdParts[1] !== clientIDHidden1 || 
        lastPart !== clientIDHidden2) {
      return res.status(400).json({ error: 'Invalid client ID.' });
    }
    clientIdParts.shift();
    clientIdParts.shift();
    clientId = clientIdParts.join('-');
  } catch (err) {
    return res.status(400).json({ error: 'Invalid client ID format.' });
  }

  // Check for existing process
  if (clientProcessMap.has(clientId)) {
    const existingProcessId = clientProcessMap.get(clientId);
    if (activeProcesses.has(existingProcessId)) {
      return res.status(400).json({ 
        error: 'You already have an active process', 
        processId: existingProcessId 
      });
    } else {
      clientProcessMap.delete(clientId);
    }
  }

  // Validate inputs
  if (clientSecret !== serverSecret) {
    sendLogToClient(clientId, `Unauthorized access attempt`, true);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!facebookCache || typeof facebookCache !== 'string' || facebookCache.trim() === '') {
    sendLogToClient(clientId, `Authentication data is required`, true);
    return res.status(400).json({ error: 'Authentication data is required.' });
  }

  if (!shareUrl || typeof shareUrl !== 'string' || shareUrl.trim() === '') {
    sendLogToClient(clientId, `Share URL is required`, true);
    return res.status(400).json({ error: 'Share URL is required.' });
  }

  if (!/^https?:\/\//i.test(shareUrl)) {
    sendLogToClient(clientId, `Invalid Share URL format`, true);
    return res.status(400).json({ error: 'Invalid Share URL format.' });
  }

  const numShareCount = parseInt(shareCount, 10);
  if (isNaN(numShareCount) || numShareCount <= 0) {
    sendLogToClient(clientId, `Invalid share count`, true);
    return res.status(400).json({ error: 'Invalid share count.' });
  }

  const numTimeInterval = parseInt(timeInterval, 10);
  if (isNaN(numTimeInterval) || numTimeInterval < 1000) {
    sendLogToClient(clientId, `Invalid time interval (must be >= 1000 ms)`, true);
    return res.status(400).json({ error: 'Invalid time interval (must be >= 1000 ms).' });
  }

  // Process authentication data
  let processedCache;
  let isToken = false;
  const agent = atob("ZmFjZWJvb2tleHRlcm5hbGhpdC8xLjEgKCtodHRwOi8vd3d3LmZhY2Vib29rLmNvbS9leHRlcm5hbGhpdF91YXRleHQucGhwKQ==");

  if (/^(EAAD6V7|EAAAAU|EAAAAY)\w+/i.test(facebookCache)) {
    processedCache = facebookCache;
    isToken = true;
    sendLogToClient(clientId, `Using access token`);
  } else {
    try {
      if (facebookCache.trim().startsWith('[') || facebookCache.trim().startsWith('{')) {
        const retrievedFbCache = JSON.parse(facebookCache);
        if (!Array.isArray(retrievedFbCache)) {
          throw new Error("Expected array format for JSON cookies");
        }
        processedCache = retrievedFbCache
          .map(data => `${data.key.trim()}=${data.value.trim()}`)
          .join("; ");
        sendLogToClient(clientId, `Using JSON cookie`);
      } else {
        processedCache = facebookCache.trim();
        sendLogToClient(clientId, `Using raw cookie`);
      }
    } catch (err) {
      sendLogToClient(clientId, `Invalid cookie format: ${err.message}`, true);
      return res.status(400).json({ 
        error: 'Invalid cookie format',
        details: 'Expected: [{"key":"...","value":"..."}] or "key=value; key2=value2"' 
      });
    }
  }

  const originalParams = {
    facebookCache,
    shareUrl,
    shareCount: numShareCount,
    timeInterval: numTimeInterval,
    clientId,
    processId: processId || uuidv4()
  };

  let sharedCount = 0;
  let errorShareCount = 0;
  let intervalId;
  const postIds = [];
  let isResponding = false;
  
  // Get token from cookie if needed
  const tokenNeeds = isToken ? processedCache : await getTokenFromCookie(processedCache, clientId, agent);
  if (!tokenNeeds) {
    return res.status(400).json({ error: 'Failed to get Facebook access token.' });
  }

  // Process setup
  const processInfo = {
    intervalId,
    isPaused: false,
    sharedCount,
    clientId,
    processId: originalParams.processId,
    originalParams,
    logs: [],
    cleanup: () => {
      clearInterval(intervalId);
      activeProcesses.delete(originalParams.processId);
      clientProcessMap.delete(clientId);
    }
  };

  // Map client to process
  clientProcessMap.set(clientId, originalParams.processId);
  activeProcesses.set(originalParams.processId, processInfo);
  
  // Start the process
  res.json({ 
    success: `Processing started`,
    processId: originalParams.processId
  });

  // Share post function
  const sharePost = async () => {
    const currentProcess = activeProcesses.get(originalParams.processId);
    if (!currentProcess || currentProcess.isPaused) return;
    
    if (sharedCount >= numShareCount || isResponding || !clients.has(clientId)) {
      if (intervalId) clearInterval(intervalId);
      if (!isResponding && clients.has(clientId) && sharedCount < numShareCount) {
        isResponding = true;
        sendErrorLog(clientId, 'Process interrupted', 'The sharing process was interrupted', true);
      }
      processInfo.cleanup();
      return;
    }

    const privacy = "SELF";
    const headers = {
      "authority": "graph.facebook.com",
      "cache-control": "max-age=0",
      "sec-ch-ua-mobile": "?0",
      "User-Agent": agent,
      "Content-Type": "application/json",
      "cookie": isToken ? '' : processedCache
    };
    
    const payload = {
      link: shareUrl,
      published: 0,
      limit: 1,
      fields: "id",
      privacy: { value: privacy },
      no_story: privacy === "SELF"
    };

    try {
      const response = await axios.post(
        `https://graph.facebook.com/me/feed?access_token=${tokenNeeds}`,
        payload, 
        { headers, timeout: 15000 }
      );
      
      sharedCount++;
      currentProcess.sharedCount = sharedCount;
      
      if (response?.data?.id) {
        postIds.push(response.data.id);
        const successShared = `Shared (${sharedCount}/${numShareCount}) successfully`;
        sendLogToClient(clientId, successShared);
      }

      if (sharedCount >= numShareCount && !isResponding) {
        isResponding = true;
        processInfo.cleanup();
        sendSuccessLog(clientId, `Total successful shares: ${sharedCount}`, `${sharedCount} shares injected`);
      }
    } catch (error) {
      errorShareCount++;
      const errorMsg = error.response?.data?.error?.message || error.message;
      sendLogToClient(clientId, `Error sharing post (${errorShareCount}): ${errorMsg}`, true);
      
      if (errorShareCount >= 3 && !isResponding) { 
        isResponding = true;
        processInfo.cleanup();
        sendErrorLog(clientId, 'Failed to share post after multiple attempts.', errorMsg, true);
      }
    }
  };

  // Start the interval
  intervalId = setInterval(sharePost, numTimeInterval);
  processInfo.intervalId = intervalId;
  activeProcesses.set(originalParams.processId, processInfo);

  // Initial share
  sharePost();
});

// Control Endpoint
app.post('/api/control', async (req, res) => {
  const { action, processId, clientSecret, clientId } = req.body;
  
  if (clientSecret !== serverSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const processInfo = activeProcesses.get(processId);
  if (!processInfo) {
    return res.status(404).json({ error: 'Process not found' });
  }
  
  if (processInfo.clientId !== clientId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  switch (action) {
    case 'pause':
      processInfo.isPaused = true;
      sendControlResponse(clientId, 'paused', true, 'Process paused successfully', {
        isPaused: true
      });
      break;
      
    case 'resume':
      processInfo.isPaused = false;
      sendControlResponse(clientId, 'resumed', true, 'Process resumed successfully', {
        isPaused: false
      });
      break;
      
    case 'stop':
      if (processInfo.cleanup) processInfo.cleanup();
      sendControlResponse(clientId, 'stopped', true, 'Process stopped successfully');
      break;
      
    default:
      return res.status(400).json({ error: 'Invalid action' });
  }
  
  res.json({ success: true });
});

// Token and Cookie Getters
app.get('/api/getoken', async (req, res) => {
  try {
    const { u: username, p: password } = req.query;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Both username (u) and password (p) parameters are required'
      });
    }

    const service = new FacebookTokenService();
    
    const eaaauResult = await service.getEaaauToken(username, password);
    if (!eaaauResult.success) {
      return res.status(400).json({
        success: false,
        error: eaaauResult.error
      });
    }

    const eaad6v7Result = await service.getEaad6v7Token(eaaauResult.token);
    
    res.json({
      success: true,
      tokens: {
        eaaau: eaaauResult.token,
        eaad6v7: eaad6v7Result.token
      }
    });
    
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

app.get('/api/getcookie', async (req, res) => {
  try {
    const { u: username, p: password } = req.query;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Both username (u) and password (p) parameters are required'
      });
    }

    const authUrl = "https://b-api.facebook.com/method/auth.login";
    const params = {
      'adid': 'e3a395f9-84b6-44f6-a0ce-fe83e934fd4d',
      'email': username,
      'password': password,
      'format': 'json',
      'device_id': '67f431b8-640b-4f73-a077-acc5d3125b21',
      'cpl': 'true',
      'family_device_id': '67f431b8-640b-4f73-a077-acc5d3125b21',
      'locale': 'en_US',
      'client_country_code': 'US',
      'credentials_type': 'device_based_login_password',
      'generate_session_cookies': '1',
      'generate_analytics_claim': '1',
      'generate_machine_id': '1',
      'currently_logged_in_userid': '0',
      'irisSeqID': '1',
      'try_num': '1',
      'enroll_misauth': 'false',
      'meta_inf_fbmeta': 'NO_FILE',
      'source': 'login',
      'machine_id': 'KBz5fEj0GAvVAhtufg3nMDYG',
      'fb_api_req_friendly_name': 'authenticate',
      'fb_api_caller_class': 'com.facebook.account.login.protocol.Fb4aAuthHandler',
      'api_key': '882a8490361da98702bf97a021ddc14d',
      'access_token': '350685531728|62f8ce9f74b12f84c123cc23437a4a32'
    };
    
    const fullUrl = authUrl + "?" + new URLSearchParams(params).toString();
    const response = await axios.get(fullUrl, { timeout: 10000 });
    const data = response.data;
    
    if (data.session_cookies) {
      const cookiesString = data.session_cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
      res.json({
        success: true,
        cookie: cookiesString
      });
    } else {
      const errorMsg = data.error_msg || data.error?.message || 'Failed to get cookies';
      res.status(400).json({
        success: false,
        error: errorMsg
      });
    }
  } catch (error) {
    console.error('Cookie generation error:', error);
    let errorMsg = 'Internal server error';
    if (error.response) {
      errorMsg = error.response.data?.error_msg || error.response.data?.error?.message || error.response.statusText;
    } else if (error.request) {
      errorMsg = 'No response from server';
    }
    
    res.status(500).json({
      success: false,
      error: errorMsg,
      details: error.message
    });
  }
});

// Helper Functions
async function getTokenFromCookie(cookie, clientId, agent) {
  try {
    const response = await axios.get('https://business.facebook.com/business_locations', {
      headers: {
        "user-agent": agent,
        "cookie": cookie
      },
      timeout: 10000 
    });
    const tokenMatch = response.data.match(/EAAG\w+/);
    if (tokenMatch && tokenMatch[0]) {
      return tokenMatch[0];
    } else {
      sendLogToClient(clientId, `Failed to extract token from response`, true);
      return null;
    }
  } catch (err) {
    console.error("Error fetching token:", err.message);
    sendLogToClient(clientId, `Error generating token: ${err.message}`, true);
    return null;
  }
}

function sendControlResponse(clientId, action, success, message, data = {}) {
  const client = clients.get(clientId);
  if (client?.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify({ 
      type: `process-${action}`, 
      success, 
      message,
      ...data
    }));
  }
}

// Facebook Token Service
class FacebookTokenService {
  constructor() {
    this.config = {
      endpoints: {
        b_graph: "https://b-graph.facebook.com",
        key: "https://b-api.facebook.com",
      },
      oauthToken: "350685531728|62f8ce9f74b12f84c123cc23437a4a32",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    };
    
    this.axios = axios.create({
      headers: {
        'User-Agent': this.config.userAgent,
        'Accept-Language': 'en_US'
      }
    });
  }

  async getEaaauToken(email, password) {
    try {
      const headers = {
        'authorization': `OAuth ${this.config.oauthToken}`,
        'x-fb-friendly-name': 'Authenticate',
        'x-fb-connection-type': 'Unknown',
        'accept-encoding': 'gzip, deflate',
        'content-type': 'application/x-www-form-urlencoded',
        'x-fb-http-engine': 'Liger'
      };

      const data = new URLSearchParams({
        adid: this.generateRandomHex(16),
        format: 'json',
        device_id: uuidv4(),
        email: email,
        password: password,
        generate_analytics_claims: '0',
        credentials_type: 'password',
        source: 'login',
        error_detail_type: 'button_with_disabled',
        enroll_misauth: 'false',
        generate_session_cookies: '0',
        generate_machine_id: '0',
        fb_api_req_friendly_name: 'authenticate',
      });

      const response = await this.axios.post(
        `${this.config.endpoints.b_graph}/auth/login`,
        data,
        { headers }
      );

      if (response.data.access_token) {
        return { 
          success: true,
          token: response.data.access_token.trim()
        };
      } else {
        return { 
          success: false,
          error: response.data.error?.message || 'Failed to get EAAAU token'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }

  async getEaad6v7Token(eaaauToken) {
    try {
      const url = `${this.config.endpoints.key}/method/auth.getSessionforApp?format=json&access_token=${eaaauToken.trim()}&new_app_id=275254692598279`;
      const response = await this.axios.get(url);

      if (response.data.access_token) {
        return {
          success: true,
          token: response.data.access_token.trim()
        };
      } else {
        return {
          success: false,
          error: response.data.error?.message || 'Failed to get EAAD6V7 token'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }

  generateRandomHex(length) {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

// Start Server
server.listen(port, () => {
  console.log(`Backend server listening on port ${port}`);
  console.log(`WebSocket server started on port ${port}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection at:', reason.stack || reason);
});
