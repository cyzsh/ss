// index.js
async function startServer() {
  return new Promise((resolve, reject) => {
    try {
      const express = require('express');
      const axios = require('axios');
      const cors = require('cors');
      const dotenv = require('dotenv');
      const WebSocket = require('ws');
      const http = require('http');
      const { v4: uuidv4 } = require('uuid');
      const url = require('url');
      const fs = require("fs-extra");
      const path = require("path");
      const rateLimit = require('express-rate-limit'); 
      const isDeveloper = false;
      
      dotenv.config();
      const app = express();
      const port = process.env.PORT;
      const serverSecret = process.env.SERVER_SECRET;
      const clientIDHidden0 = "96b";
      const clientIDHidden1 = "6ba2rtl1";
      const clientIDHidden2 = "js5sal2";

      app.set('trust proxy', 1);

      const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100, 
        message: 'Too many requests from this IP, please try again after 15 minutes.',
        standardHeaders: true,
        legacyHeaders: false,
      });
      app.use(express.static(path.join(__dirname, 'public')));
      
      app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
      });
      
      app.use('/api/', limiter); 
      app.use(cors());
      app.use(express.json({ limit: '1mb' })); 

      const server = http.createServer(app);
      const wss = new WebSocket.Server({ server });
      const clients = new Map();
      const activeProcesses = new Map();
      const allowedOrigin = ["https://fbautoshare.koyeb.app"];
      
      if (isDeveloper) {
          allowedOrigin.push('http://localhost:5173');
      }

      // Check for existing process endpoint
      app.post('/api/check-process', async (req, res) => {
        const { clientSecret, clientId } = req.body;
        
        if (clientSecret !== serverSecret) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        
        // Find any active process for this client
        for (const [processId, processInfo] of activeProcesses) {
          if (processInfo.clientId === clientId) {
            return res.json({
              processId,
              isPaused: processInfo.isPaused
            });
          }
        }
        
        res.json({ processId: null });
      });

      wss.on('connection', (ws, req) => {
        const parsedUrl = url.parse(req.url, true);
        const clientId = parsedUrl.query.clientId;
        
        if (!clientId) {
          console.error('WebSocket connection without clientId.');
          ws.close();
          return;
        }
        
        const safeClientId = String(clientId).replace(/[^a-zA-Z0-9_-]/g, '');
        if (safeClientId !== clientId) {
          console.warn(`Potentially unsafe clientId received: ${clientId}, using sanitized: ${safeClientId}`);
        }

        clients.set(safeClientId, ws);
        
        ws.on('close', () => {
          clients.delete(safeClientId);
        });

        ws.on('error', (error) => {
          console.error(`WebSocket error for client ${safeClientId}:`, error);
          clients.delete(safeClientId);
        });
        ws.clientId = safeClientId;
      });
      
      function sendLogToClient(clientId, message, isError = false) {
        const client = clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'backend-log', message: isError ? `ERROR: ${message}` : message }));
        }
      }
      
      function sendSuccessLog(clientId, message, details) {
        const client = clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "success-shared", success: message, details: details }));
        }
      }
      
      function sendErrorLog(clientId, message, details) {
        const client = clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "error-shared", message: message, details: details }));
        }
      }

      function sendControlResponse(clientId, action, success, message) {
        const client = clients.get(clientId);
        if (client && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ 
            type: `process-${action}`, 
            success, 
            message 
          }));
        }
      }
      
      app.post('/api/share', async (req, res) => {
        const { facebookCache, shareUrl, shareCount, timeInterval, clientSecret, clientIdX, processId } = req.body;
        let websiteOrigin = req.headers.origin;
        
        if (!allowedOrigin.includes(websiteOrigin)) {
          return res.status(400).json({ error: 'Unauthorized origin' });
        }
        
        let clientId;
        const agent = atob("ZmFjZWJvb2tleHRlcm5hbGhpdC8xLjEgKCtodHRwOi8vd3d3LmZhY2Vib29rLmNvbS9leHRlcm5hbGhpdF91YXRleHQucGhwKQ==");
        
        try {
          const clientIdsecret = clientIdX.split('-');
          const lastPart = await clientIdsecret.pop();
          if (clientIdsecret[0] !== clientIDHidden0) {
            return res.status(400).json({ error: 'Invalid client ID.' });
          }
          if (clientIdsecret[1] !== clientIDHidden1) {
            return res.status(400).json({ error: 'Invalid client ID.' });
          }
          if (lastPart !== clientIDHidden2) {
            return res.status(400).json({ error: 'Invalid client ID.' });
          }
          await clientIdsecret.shift();
          await clientIdsecret.shift();
          clientId = clientIdsecret.join('-');
        } catch (err) {
          console.error(err)
          clientId = "";
        }
        
        if (!clientId || typeof clientId !== 'string' || clientId.trim() === '' || !clients.has(clientId)) {
          return res.status(400).json({ error: 'Invalid client ID.' });
        }

        if (clientSecret !== serverSecret) {
          console.warn(`Unauthorized access attempt from client: ${clientId}`);
          sendLogToClient(clientId, `Unauthorized access attempt.`, true);
          return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!facebookCache || typeof facebookCache !== 'string' || facebookCache.trim() === '') {
          sendLogToClient(clientId, `Authentication data is required.`, true);
          return res.status(400).json({ error: 'Authentication data is required.' });
        }

        if (!shareUrl || typeof shareUrl !== 'string' || shareUrl.trim() === '') {
          sendLogToClient(clientId, `Share URL is required.`, true);
          return res.status(400).json({ error: 'Share URL is required.' });
        }
        
        if (!/^https?:\/\//i.test(shareUrl)) {
          sendLogToClient(clientId, `Invalid Share URL format.`, true);
          return res.status(400).json({ error: 'Invalid Share URL format.' });
        }

        if (isNaN(shareCount) || parseInt(shareCount) <= 0) {
          sendLogToClient(clientId, `Invalid share count.`, true);
          return res.status(400).json({ error: 'Invalid share count.' });
        }
        const numShareCount = parseInt(shareCount, 10);

        if (isNaN(timeInterval) || parseInt(timeInterval) < 1000) {
          sendLogToClient(clientId, `Invalid time interval (must be >= 1000 ms).`, true);
          return res.status(400).json({ error: 'Invalid time interval (must be >= 1000 ms).' });
        }
        const numTimeInterval = parseInt(timeInterval, 10);

        let processedCache;
        let isToken = false;
        
        // Handle token/cookie input
        if (/^(EAAD6V7|EAAAAU|EAAAAY)\w+/i.test(facebookCache)) {
          processedCache = facebookCache;
          isToken = true;
          sendLogToClient(clientId, `USING ACCESS TOKEN`);
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
              sendLogToClient(clientId, `USING JSON COOKIE`);
            } else {
              processedCache = facebookCache.trim();
              sendLogToClient(clientId, `USING RAW COOKIE`);
            }
          } catch (err) {
            console.error(err);
            sendLogToClient(clientId, `INVALID COOKIE FORMAT: ${err.message}`, true);
            return res.status(400).json({ 
              error: 'Invalid cookie format',
              details: 'Expected: [{"key":"...","value":"..."}] or "key=value; key2=value2"' 
            });
          }
        }
        
        const originalParams = {
          facebookCache,
          shareUrl,
          shareCount: parseInt(shareCount, 10),
          timeInterval: parseInt(timeInterval, 10),
          clientId,
          processId: processId || uuidv4()
        };

        let sharedCount = 0;
        let errorShareCount = 0;
        let intervalId;
        const postIds = [];
        let isResponding = false;
        
        const tokenNeeds = isToken ? processedCache : await getTokenFromCookie(processedCache, clientId, agent);
        
        if (!tokenNeeds) {
          return res.status(400).json({ error: 'Failed to get Facebook access token.' });
        }
        
        const processInfo = {
          intervalId,
          isPaused: false,
          sharedCount,
          clientId,
          processId: originalParams.processId,
          originalParams,
          cleanup: () => {
            clearInterval(intervalId);
            activeProcesses.delete(originalParams.processId);
          }
        };
        
        activeProcesses.set(originalParams.processId, processInfo);
        
        res.json({ 
          success: `Processing started`,
          processId: originalParams.processId
        });
        
        const sharePost = async () => {
          const currentProcess = activeProcesses.get(processId);
          if (!currentProcess || currentProcess.isPaused) return;
          
          if (sharedCount >= numShareCount || isResponding || !clients.has(clientId)) {
            clearInterval(intervalId);
            activeProcesses.delete(processId);
            if (!isResponding && clients.has(clientId) && sharedCount < numShareCount) {
              isResponding = true;
              return;
            }
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
            const response = await axios.post(`https://graph.facebook.com/me/feed?access_token=${tokenNeeds}`, payload, { headers, timeout: 15000 });
            sharedCount++;
            currentProcess.sharedCount = sharedCount;
            const postId = response?.data?.id;
            if (postId) {
              postIds.push(postId);
              const successShared = `Shared (${sharedCount}/${numShareCount}) successfully`;
              const additionalShared = `Additional 1 shared (special).`;
              if (sharedCount > numShareCount) {
                sendLogToClient(clientId, additionalShared);
              } else {
                sendLogToClient(clientId, successShared);
              }
            } else {
              sendLogToClient(clientId, `Failed to get post ID: ${JSON.stringify(response?.data)}`, true);
            }

            if (sharedCount >= numShareCount && !isResponding) {
              isResponding = true;
              clearInterval(intervalId);
              activeProcesses.delete(processId);
              return sendSuccessLog(clientId, `Total successful shares : ${sharedCount}`, `${sharedCount} shares injected`);
            }
          } catch (error) {
            errorShareCount++;
            sendLogToClient(clientId, `Error sharing post (${errorShareCount}): ${error.response?.data?.error?.message || error.message}`, true);
            if (errorShareCount >= 3 && !isResponding) { 
              isResponding = true;
              clearInterval(intervalId);
              activeProcesses.delete(processId);
              return sendErrorLog(clientId, 'Failed to share post after multiple attempts.', error.response?.data?.error?.message || error.message);
            }
          }
        };

        intervalId = setInterval(sharePost, numTimeInterval);
        processInfo.intervalId = intervalId;
        activeProcesses.set(processId, processInfo);

        setTimeout(() => {
          if (!isResponding) {
            isResponding = true;
            clearInterval(intervalId);
            activeProcesses.delete(processId);
            return sendErrorLog(clientId, 'Sharing process timed out or encountered issues.', `Reached timeout after ${sharedCount} successful shares.`);
          }
        }, (numShareCount * numTimeInterval) + 15000); 
      });
      
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
            activeProcesses.set(processId, processInfo);
            sendControlResponse(clientId, 'paused', true, 'Process paused successfully');
            break;
            
          case 'resume':
            processInfo.isPaused = false;
            activeProcesses.set(processId, processInfo);
            sendControlResponse(clientId, 'resumed', true, 'Process resumed successfully');
            break;
            
          case 'stop':
            if (processInfo.cleanup) processInfo.cleanup();
            sendControlResponse(clientId, 'stopped', true, 'Process stopped successfully');
            break;
            
          case 'restart':
            if (!processInfo.originalParams) {
              return res.status(400).json({ error: 'Original parameters not available for restart' });
            }
            
            if (processInfo.cleanup) processInfo.cleanup();
            
            setTimeout(async () => {
              try {
                const newProcessId = uuidv4();
                const { facebookCache, shareUrl, shareCount, timeInterval } = processInfo.originalParams;
                
                const internalReq = {
                  body: {
                    facebookCache,
                    shareUrl,
                    shareCount,
                    timeInterval,
                    clientSecret,
                    clientIdX: `${clientIDHidden0}-${clientIDHidden1}-${clientId}-${clientIDHidden2}`,
                    processId: newProcessId
                  },
                  headers: {
                    origin: allowedOrigin[0]
                  }
                };
                
                await app.handle(internalReq, {
                  json: (data) => {
                    if (data.success) {
                      sendControlResponse(clientId, 'restarted', true, `Process restarted with ID: ${newProcessId}`);
                    } else {
                      sendErrorLog(clientId, 'Failed to restart process', data.error);
                    }
                  },
                  status: (code) => ({
                    json: (data) => {
                      sendErrorLog(clientId, `Restart failed with status ${code}`, data.error);
                    }
                  })
                });
              } catch (err) {
                sendErrorLog(clientId, 'Error during restart', err.message);
              }
            }, 1000);
            
            res.json({ success: true, message: 'Process restart initiated' });
            return;
            
          default:
            return res.status(400).json({ error: 'Invalid action' });
        }
        
        res.json({ success: true });
      });
      
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

      const config = {
        endpoints: {
          b_graph: "https://b-graph.facebook.com",
          key: "https://b-api.facebook.com",
        },
        oauthToken: "350685531728|62f8ce9f74b12f84c123cc23437a4a32",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      };

      class FacebookTokenService {
        constructor() {
          this.axios = axios.create({
            headers: {
              'User-Agent': config.userAgent,
              'Accept-Language': 'en_US'
            }
          });
        }

        async getEaaauToken(email, password) {
          try {
            const headers = {
              'authorization': `OAuth ${config.oauthToken}`,
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
              `${config.endpoints.b_graph}/auth/login`,
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
            const url = `${config.endpoints.key}/method/auth.getSessionforApp?format=json&access_token=${eaaauToken.trim()}&new_app_id=275254692598279`;
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
            const tokenValue = tokenMatch[0];
            return tokenValue;
          } else {
            sendLogToClient(clientId, `FAILED TO EXTRACT TOKEN FROM RESPONSE`, true);
            return null;
          }
        } catch (err) {
          console.error("Error fetching token:", err.message);
          sendLogToClient(clientId, `ERROR GENERATING TOKEN: ${err.message}`, true);
          return null;
        }
      }

      server.listen(port, () => {
        console.log(`Backend server listening on port ${port}`);
        console.log(`WebSocket server started on port ${port}`);
        resolve();
      });

      server.on('error', (err) => {
        reject(err);
      });

    } catch (err) {
      reject(err);
    }
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection at:', reason.stack || reason);
});

startServer().catch(error => {
  console.error('Failed to start server:', error);
});
