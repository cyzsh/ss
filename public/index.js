// Generate UUID or get from cookie
	function getOrCreateClientId() {
	const cookieName = 'fss_cid';
	const existingId = getCookie(cookieName);
	
	if (existingId) {
	console.log("Existing Client ID: ", existingId);
	return existingId;
	} else {
	const newId = uuidv4();
	setCookie(cookieName, newId, 365);
	console.log("New Client ID: ", newId);
	return newId;
	}
	}
	
	// Cookie helper functions
	function setCookie(name, value, days) {
	const date = new Date();
	date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
	const expires = "expires=" + date.toUTCString();
	document.cookie = name + "=" + value + ";" + expires + ";path=/;SameSite=Lax";
	}
	
	function getCookie(name) {
	const cookieName = name + "=";
	const decodedCookie = decodeURIComponent(document.cookie);
	const cookieArray = decodedCookie.split(';');
	
	for(let i = 0; i < cookieArray.length; i++) {
	let cookie = cookieArray[i];
	while (cookie.charAt(0) === ' ') {
	cookie = cookie.substring(1);
	}
	if (cookie.indexOf(cookieName) === 0) {
	return cookie.substring(cookieName.length, cookie.length);
	}
	}
	return null;
	}
	
	// Generate UUID
	function uuidv4() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
	const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
	return v.toString(16);
	});
	}
	
	// Check if in iframe
	if (window.top !== window.self) {
	window.top.location.href = window.self.location.href;
	}
	
	// App state
	const state = {
	accessToken: getCookie('fss_accessToken') || "",
	shareUrl: getCookie('fss_shareUrl') || "",
	delay: parseInt(getCookie('fss_delay')) || 1500,
	limit: parseInt(getCookie('fss_limit')) || 10,
	isSubmitting: false,
	isPaused: false,
	logs: [],
	backendResponse: null,
	loading: false,
	clientId: getOrCreateClientId(),
	a: "96b",
	b: "6ba2rtl1",
	c: "js5sal2",
	apiHost: window.location.hostname,
	apiHttp: window.location.protocol === 'https:' ? 'https' : 'http',
	apiWss: window.location.protocol === 'https:' ? 'wss' : 'ws',
	serverSecret: "JSIUFJFJDKDKDKKkkskskskdkKksjjdjdjjJSISIDJSJJSJSJSIUFJFJDKDKDKKkkskskskdkKksjjdjdjjJSISIDJSJJSJS",
	ws: null,
	currentProcessId: null,
	hasSubmitted: false,
	terminalAutoScroll: true,
	reconnectAttempts: 0,
	maxReconnectAttempts: 10,
	reconnectDelay: 3000,
	restoredProcess: false
	};
	
	// Save form state to cookies
	function saveFormState() {
	setCookie('fss_accessToken', state.accessToken, 7);
	setCookie('fss_shareUrl', state.shareUrl, 7);
	setCookie('fss_delay', state.delay, 7);
	setCookie('fss_limit', state.limit, 7);
	}
	
	// Initialize the app
	function initApp() {
	// Initialize WebSocket
	initWebSocket();
	
	// Check for existing process on load
	checkExistingProcess();
	
	// Render the initial view
	renderMainContent();
	renderTokenizerContent();
	
	// Setup navigation
	setupNavigation();
	
	updateSubmitButton(validateForm());
	}
	
	// Check for existing process on page load
	async function checkExistingProcess() {
	try {
	const response = await fetch(`${state.apiHttp}://${state.apiHost}/api/check-process`, {
	method: 'POST',
	headers: {
	    'Content-Type': 'application/json',
	},
	body: JSON.stringify({
	    clientSecret: state.serverSecret,
	    clientId: state.clientId
	})
	});
	
	const data = await response.json();
	if (data.processId) {
	state.currentProcessId = data.processId;
	state.isSubmitting = true;
	state.isPaused = data.isPaused || false;
	state.loading = !data.isPaused;
	state.restoredProcess = true;
	
	// Restore state from existing process
	if (data.originalParams) {
	    state.accessToken = data.originalParams.facebookCache;
	    state.shareUrl = data.originalParams.shareUrl;
	    state.delay = data.originalParams.timeInterval;
	    state.limit = data.originalParams.shareCount;
	}
	
	// Restore logs from existing process
	if (data.logs && data.logs.length > 0) {
	    state.logs = data.logs.map(log => ({
	        message: log.message,
	        isError: log.message.includes('ERROR:'),
	        id: log.timestamp || Date.now() + Math.random(),
	        isNew: false
	    }));
	}
	
	// Show terminal if there are logs
	if (state.logs.length > 0) {
	    document.getElementById('terminal-tab').classList.remove('disabled');
	    document.getElementById('terminal-tab').click();
	}
	
	renderMainContent();
	}
	} catch (error) {
	console.error('Error checking for existing process:', error);
	}
	}
	
	// Initialize WebSocket with silent reconnection logic
	function initWebSocket() {
	const wsUrl = `${state.apiWss}://${state.apiHost}/api?clientId=${state.clientId}`;
	state.ws = new WebSocket(wsUrl);
	
	state.ws.onopen = () => {
	state.reconnectAttempts = 0;
	if (state.currentProcessId) {
	addLog('SYSTEM IS ONLINE.', false);
	}
	};
	
	state.ws.onmessage = (event) => {
	try {
	const data = JSON.parse(event.data);
	if (data.type === "backend-log") {
	    addLog(`${data.message}`, data.message.toLowerCase().includes("error"));
	} else if (data.type === "success-shared") {
	    state.isSubmitting = false;
	    state.loading = false;
	    state.currentProcessId = null;
	    state.backendResponse = {
	        success: true,
	        message: "INJECTION SUCCESSFUL.",
	        details: data.details ? data.details : "No additional details.", 
	    };
	    addLog("OPERATION COMPLETE", false);
	    updateNavigationState();
	    renderMainContent();
	} else if (data.type === "error-shared") {
	    state.isSubmitting = false;
	    state.loading = false;
	    state.currentProcessId = null;
	    state.backendResponse = {
	        success: false,
	        message: data.message || "ERROR: INJECTION FAILED",
	        details: data.details || "An unexpected error occurred."
	    };
	    addLog(data.message || "ERROR: INJECTION FAILED", true);
	    updateNavigationState();
	    renderMainContent();
	} else if (data.type === "process-paused") {
	    state.isPaused = true;
	    addLog("PROCESS PAUSED", false);
	    renderMainContent();
	} else if (data.type === "process-resumed") {
	    state.isPaused = false;
	    addLog("PROCESS RESUMED", false);
	    renderMainContent();
	} else if (data.type === "process-stopped") {
	    state.isSubmitting = false;
	    state.loading = false;
	    state.currentProcessId = null;
	    addLog("PROCESS STOPPED", false);
	    renderMainContent();
	} else if (data.type === "process-restarted") {
	    state.currentProcessId = data.newProcessId || state.currentProcessId;
	    addLog(`PROCESS RESTARTED WITH NEW ID: ${state.currentProcessId}`, false);
	    renderMainContent();
	}
	} catch (error) {
	console.error("Error parsing WebSocket message:", error);
	state.isSubmitting = false;
	state.loading = false;
	state.currentProcessId = null;
	addLog("SYSTEM ERROR: Invalid response format", true);
	updateNavigationState();
	renderMainContent();
	}
	};
	
	state.ws.onclose = () => {
	if (state.reconnectAttempts < state.maxReconnectAttempts) {
	state.reconnectAttempts++;
	setTimeout(initWebSocket, state.reconnectDelay);
	}
	};
	
	state.ws.onerror = (error) => {
	console.error("WebSocket error:", error);
	};
	}

// Setup navigation
function setupNavigation() {
  const homeTab = document.getElementById('home-tab');
  const terminalTab = document.getElementById('terminal-tab');
  const tokenizerTab = document.getElementById('tokenizer-tab');
  const homeSection = document.getElementById('home-section');
  const terminalSection = document.getElementById('terminal-section');
  const tokenizerSection = document.getElementById('tokenizer-section');
  
  homeTab.addEventListener('click', () => {
    homeTab.classList.add('active');
    terminalTab.classList.remove('active');
    tokenizerTab.classList.remove('active');
    homeSection.classList.add('active');
    terminalSection.classList.remove('active');
    tokenizerSection.classList.remove('active');
  });
  
  terminalTab.addEventListener('click', () => {
    terminalTab.classList.add('active');
    homeTab.classList.remove('active');
    tokenizerTab.classList.remove('active');
    terminalSection.classList.add('active');
    homeSection.classList.remove('active');
    tokenizerSection.classList.remove('active');
    renderTerminal();
  });
  
  tokenizerTab.addEventListener('click', () => {
    tokenizerTab.classList.add('active');
    homeTab.classList.remove('active');
    terminalTab.classList.remove('active');
    tokenizerSection.classList.add('active');
    homeSection.classList.remove('active');
    terminalSection.classList.remove('active');
  });
  
  // Enable terminal tab if there are logs
  if (state.logs.length > 0) {
    terminalTab.classList.remove('disabled');
  }
}

// Update navigation state based on app state
function updateNavigationState() {
  const terminalTab = document.getElementById('terminal-tab');
  
  // Enable terminal tab if there are logs
  if (state.logs.length > 0) {
    terminalTab.classList.remove('disabled');
  }
}

function scrollTerminalToBottom() {
  const terminalContent = document.querySelector('.terminal-content');
  if (terminalContent && state.terminalAutoScroll) {
    terminalContent.scrollTop = terminalContent.scrollHeight;
  }
}

// Add log message
function addLog(message, isError) {
  const newLog = {
    message,
    isError,
    id: Date.now() + Math.random(),
    isNew: true
  };
  
  state.logs = [...state.logs, newLog];
  updateNavigationState();
  
  // If terminal is visible, update it
  if (document.getElementById('terminal-section').classList.contains('active')) {
    renderTerminal();
  }
  
  // Always scroll to bottom when new logs arrive
  setTimeout(scrollTerminalToBottom, 50);
}

// Handle input changes
function handleInputChange(e) {
  const { name, value } = e.target;
  switch (name) {
    case "accessToken":
      state.accessToken = value;
      break;
    case "shareUrl":
      state.shareUrl = value;
      break;
    case "delay":
      state.delay = parseInt(value, 10) || 1500;
      break;
    case "limit":
      state.limit = parseInt(value, 10) || 10;
      break;
    default:
      break;
  }
  saveFormState();
  updateSubmitButton(validateForm());
}

// Validate Facebook URL
function validateFacebookUrl(url) {
  const regex = /^(https?:\/\/)?(www\.)?facebook\.com\/(.+\/)?(videos|posts|permalink|groups|.+\/videos|.+\/posts|.+\/photos|.+\/activity)\/.+/i;
  return regex.test(url.trim());
}

// Validate token format
function validateToken(token) {
  return /^(EAAD6V7|EAAAAU|EAAAAAY)\w+/i.test(token);
}

// Validate cookie format
function validateCookie(cookie) {
  try {
    JSON.parse(cookie);
    return true;
  } catch (e) {
    const cookieRegex = /^([^\s=;]+=[^\s=;]*)(;\s*[^\s=;]+=[^\s=;]*)*$/;
    return cookieRegex.test(cookie.trim());
  }
}

// Show error message
function showError(element, message) {
  let errorEl = element.nextElementSibling;
  if (!errorEl || !errorEl.classList.contains('error-message')) {
    errorEl = document.createElement('div');
    errorEl.className = 'error-message';
    element.parentNode.appendChild(errorEl);
  }
  errorEl.textContent = message;
  return false;
}

// Hide error message
function hideError(element) {
  const errorEl = element.nextElementSibling;
  if (errorEl && errorEl.classList.contains('error-message')) {
    errorEl.remove();
  }
  return true;
}

// Validate form
function validateForm() {
  let isValid = true;
  const tokenInput = document.getElementById('accessToken');
  const urlInput = document.getElementById('shareUrl');
  
  // Clear previous errors
  if (tokenInput) hideError(tokenInput);
  if (urlInput) hideError(urlInput);
  
  // Check if all required fields are filled
  if (!state.accessToken || !state.shareUrl || !state.delay || !state.limit) {
    isValid = false;
  }
  
  // Only validate format after submission
  if (state.hasSubmitted && isValid) {
    if (state.accessToken) {
      const isToken = validateToken(state.accessToken);
      const isCookie = validateCookie(state.accessToken);
      
      if (!isToken && !isCookie) {
        isValid = false;
        showError(tokenInput, 'Invalid format. Must be valid cookie or access token');
      }
    }
    
    if (state.shareUrl && !validateFacebookUrl(state.shareUrl)) {
      isValid = false;
      showError(urlInput, 'Please enter a valid Facebook post URL');
    }
  }
  
  return isValid;
}

// Update submit button state
function updateSubmitButton(isValid) {
  const submitBtn = document.getElementById('submit-btn');
  if (!submitBtn) return;
  
  if (isValid && !state.isSubmitting) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-terminal mr-2 animate-bounce"></i> EXECUTE INJECTION';
    submitBtn.classList.remove('cursor-not-allowed', 'bg-gray-600', 'text-gray-400');
    submitBtn.classList.add('bg-cyan-500', 'hover:bg-cyan-600', 'animate-glow');
  } else {
    submitBtn.disabled = true;
    submitBtn.innerHTML = state.isSubmitting 
      ? '<i class="fas fa-spinner animate-spin mr-2"></i> PROCESSING...' 
      : '<i class="fas fa-terminal mr-2 animate-bounce"></i> EXECUTE INJECTION';
    submitBtn.classList.add('cursor-not-allowed', 'bg-gray-600', 'text-gray-400');
    submitBtn.classList.remove('bg-cyan-500', 'hover:bg-cyan-600', 'animate-glow');
  }
}

// Handle form submission
async function handleSubmit(e) {
  e.preventDefault();
  state.hasSubmitted = true;
  
  if (!validateForm()) {
    return;
  }
  
  state.isSubmitting = true;
  state.loading = true;
  state.currentProcessId = Date.now().toString();
  state.logs = [{ message: "INITIATING SEQUENCE...", isError: false }];
  state.backendResponse = null; 
  
  document.getElementById('terminal-tab').click();
  updateNavigationState();
  renderMainContent();
  
  try {
    const response = await fetch(`${state.apiHttp}://${state.apiHost}/api/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        facebookCache: state.accessToken,
        shareUrl: state.shareUrl,
        shareCount: state.limit,
        timeInterval: state.delay,
        clientSecret: state.serverSecret,
        clientIdX: `${state.a}-${state.b}-${state.clientId}-${state.c}`,
        processId: state.currentProcessId
      })
    });

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
  } catch (error) {
    state.isSubmitting = false;
    state.loading = false;
    state.currentProcessId = null;
    state.backendResponse = {
      success: false,
      message: "ERROR: INJECTION FAILED",
      details: error.message || "An unexpected error occurred.", 
    };
    renderTerminal();
    updateNavigationState();
    renderMainContent();
  }
}

// Handle control actions
async function handleControlAction(action) {
  if (!state.currentProcessId) return;
  
  // Keep the confirmation dialogs
  let confirmText;
  switch (action) {
    case 'pause':
      confirmText = 'Are you sure you want to pause the current process?';
      break;
    case 'resume':
      confirmText = 'Are you sure you want to resume the paused process?';
      break;
    case 'stop':
      confirmText = 'Are you sure you want to stop the current process?';
      break;
    default:
      return;
  }

  const result = await Swal.fire({
    title: 'Confirm Action',
    text: confirmText,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#3085d6',
    cancelButtonColor: '#d33',
    confirmButtonText: 'Yes',
    cancelButtonText: 'No'
  });
  
  if (result.isConfirmed) {
    try {
      const response = await fetch(`${state.apiHttp}://${state.apiHost}/api/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          processId: state.currentProcessId,
          clientSecret: state.serverSecret,
          clientId: state.clientId
        })
      });
      
      const data = await response.json();
      if (data.success) {
        // Silently update state without logs
        switch (action) {
          case 'pause':
            state.isPaused = true;
            break;
          case 'resume':
            state.isPaused = false;
            break;
          case 'stop':
            state.isSubmitting = false;
            state.currentProcessId = null;
            break;
        }
        renderMainContent();
      } else {
        // Only show errors
        addLog(data.error || 'Action failed', true);
      }
    } catch (error) {
      addLog(`Error: ${error.message}`, true);
    }
  }
}

// Render main content
function renderMainContent() {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;
  
  mainContent.innerHTML = `
    <div class="relative bg-gray-800 bg-opacity-85 backdrop-blur-md rounded-xl shadow-lg p-6 w-full max-w-md border border-cyan-600 animate-glow-fast animate-fade-in">
      <div class="absolute top-3 left-3 text-cyan-400 animate-flicker">
        <i class="fas fa-terminal" style="font-size: 22px;"></i>
      </div>
      <h2 class="text-lg sm:text-xl font-bold text-cyan-300 mb-6 text-center tracking-wider uppercase animate-fade-down">
        CONTROL PANEL
      </h2>

      <form onsubmit="handleSubmit(event)" class="space-y-4 animate-fade-in">
        <div class="mb-3 animate-fade-in-down delay-100">
          <label for="accessToken" class="block text-gray-400 text-xs sm:text-sm font-semibold mb-1 flex items-center">
            <i class="fas fa-terminal mr-2 text-cyan-400" style="font-size: 14px;"></i>
            <span class="text-cyan-300">FACEBOOK COOKIE/TOKEN</span>
          </label>
          <textarea
            id="accessToken"
            name="accessToken"
            rows="8"
            class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 font-mono text-xs sm:text-sm animate-slide-in-left"
            value="${state.accessToken}"
            oninput="handleInputChange(event)"
            placeholder="PASTE YOUR COOKIE OR ACCESS TOKEN HERE (EAAD6V7, EAAAAU, EAAAAAY)"
            required
          >${state.accessToken}</textarea>
        </div>
        
        <div class="mb-3 animate-fade-in-down delay-200">
          <label for="shareUrl" class="block text-gray-400 text-xs sm:text-sm font-semibold mb-1 flex items-center">
            <i class="fas fa-bullseye mr-2 text-cyan-400" style="font-size: 14px;"></i>
            <span class="text-cyan-300">TARGET URL</span>
          </label>
          <input
            type="text"
            id="shareUrl"
            name="shareUrl"
            class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 font-mono text-xs sm:text-sm animate-slide-in-right"
            value="${state.shareUrl}"
            oninput="handleInputChange(event)"
            placeholder="ENTER POST URL"
            required
          />
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="mb-3 animate-fade-in-down delay-300">
            <label for="delay" class="block text-gray-400 text-xs sm:text-sm font-semibold mb-1 flex items-center">
              <i class="fas fa-clock mr-2 text-cyan-400" style="font-size: 14px;"></i>
              <span class="text-cyan-300">INTERVAL (MS)</span>
            </label>
            <input
              type="number"
              id="delay"
              name="delay"
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 font-mono text-xs sm:text-sm"
              value="${state.delay}"
              oninput="handleInputChange(event)"
              placeholder="DELAY"
              min="500"
              required
            />
          </div>
          
          <div class="mb-3 animate-fade-in-down delay-400">
            <label for="limit" class="block text-gray-400 text-xs sm:text-sm font-semibold mb-1 flex items-center">
              <i class="fas fa-refresh mr-2 text-cyan-400" style="font-size: 14px;"></i>
              <span class="text-cyan-300">ITERATION CYCLE</span>
            </label>
            <input
              type="number"
              id="limit"
              name="limit"
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 font-mono text-xs sm:text-sm"
              value="${state.limit}"
              oninput="handleInputChange(event)"
              placeholder="COUNT"
              min="1"
              required
            />
          </div>
        </div>
        
        <div class="flex justify-center items-center p-2 animate-fade-in-up delay-500">
          <button
            type="submit"
            class="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-bold py-2.5 px-4 rounded-full focus:outline-none focus:shadow-outline transition-colors duration-300 flex items-center justify-center text-xs sm:text-sm ${state.isSubmitting ? "cursor-wait animate-pulse" : "animate-glow"}"
            ${state.isSubmitting ? "disabled" : ""}
            id="submit-btn"
          >
            ${state.isSubmitting ? 
              '<i class="fas fa-spinner animate-spin mr-2"></i> PROCESSING...' : 
              '<i class="fas fa-terminal mr-2 animate-bounce"></i> EXECUTE INJECTION'}
          </button>
        </div>
      </form>
      
      ${state.isSubmitting ? `
        <div class="grid grid-cols-2 gap-2 mt-4 animate-fade-in-up delay-600">
          <button
            onclick="handleControlAction('${state.isPaused ? 'resume' : 'pause'}')"
            class="control-btn bg-yellow-500 hover:bg-yellow-600 text-black"
          >
            <i class="fas fa-${state.isPaused ? 'play' : 'pause'} mr-1"></i>
            ${state.isPaused ? 'RESUME' : 'PAUSE'}
          </button>
          
          <button
            onclick="handleControlAction('stop')"
            class="control-btn bg-red-500 hover:bg-red-600 text-black"
          >
            <i class="fas fa-stop mr-1"></i>
            STOP
          </button>
        </div>
      ` : ''}
    </div>
  `;
  
  updateSubmitButton(validateForm());
}

// Render terminal
function renderTerminal() {
  const terminalSection = document.getElementById('terminal-section');
  if (!terminalSection) return;
  
  terminalSection.innerHTML = `
    <div class="relative bg-gray-900 bg-opacity-95 backdrop-blur-lg rounded-lg shadow-lg p-6 w-full border border-cyan-600 text-cyan-400 font-mono text-sm animate-scanline terminal-container">
      <div class="absolute top-2 left-2 right-2 bottom-2 border border-cyan-700 rounded-md pointer-events-none animate-flicker-fast"></div>
      <div class="terminal-header mb-4 text-center animate-fade-down delay-100">
        <div class="text-lg font-semibold text-cyan-500 animate-pulse mb-1">
          <i class="fas fa-terminal inline-block mr-2 align-middle"></i>
          TERMINAL
        </div>
      </div>
      <div class="terminal-content w-full bg-black bg-opacity-80 border border-cyan-700 p-3 rounded-md text-xs sm:text-sm">
        ${state.logs.map((line) => `
          <div 
            key="${line.id}" 
            class="flex items-center mb-1 ${line.isNew ? 'animate-typing-short' : ''}"
          >
            <span class="text-cyan-600 mr-2">></span>
            <span class="${line.isError ? 'text-red-400' : 'text-white'} terminal-line">${line.message}</span>
            ${line.isError ? '<i class="fas fa-exclamation-triangle ml-2 text-red-500"></i>' : ''}
          </div>
        `).join('')}
        ${state.loading ? `
          <div class="flex items-center">
            <span class="text-yellow-500 mr-2">></span>
            <i class="fas fa-spinner animate-spin mr-2 text-yellow-400"></i>
            <span class="text-yellow-300">PROCESSING...</span>
          </div>
        ` : ''}
        ${state.backendResponse ? `
          <div class="flex items-start">
            <span class="text-cyan-600 mr-2">></span>
            <div class="flex-1">
              <span class="${state.backendResponse.success ? "text-lime-400 flex items-center" : "text-red-400 flex items-center"}">
                ${state.backendResponse.success ? 
                  '<i class="fas fa-check-circle mr-1"></i>' : 
                  '<i class="fas fa-exclamation-triangle mr-1"></i>'}
                <span class="font-semibold">${state.backendResponse.message}</span>
              </span>
              ${state.backendResponse.details ? `
                <p class="text-gray-400 text-xs mt-1">
                  ${state.backendResponse.details}
                </p>
              ` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
  
  // Mark all logs as displayed
  state.logs = state.logs.map(log => ({ ...log, isNew: false }));
  
  // Set up scroll behavior
  const terminalContent = document.querySelector('.terminal-content');
  if (terminalContent) {
    terminalContent.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = terminalContent;
      state.terminalAutoScroll = scrollTop + clientHeight >= scrollHeight - 10;
    });
    scrollTerminalToBottom();
  }
}

// Render tokenizer content
function renderTokenizerContent() {
  const tokenizerSection = document.getElementById('tokenizer-section');
  if (!tokenizerSection) return;
  
  tokenizerSection.innerHTML = `
    <div class="relative bg-gray-800 bg-opacity-85 backdrop-blur-md rounded-xl shadow-lg p-6 w-full max-w-md border border-yellow-600 animate-glow-fast animate-fade-in">
      <div class="absolute top-3 left-3 text-yellow-400 animate-flicker">
        <i class="fas fa-terminal" style="font-size: 22px;"></i>
      </div>
      
      <h2 class="text-lg sm:text-xl font-bold text-yellow-300 mb-2 text-center tracking-wider uppercase animate-fade-down">
        TOKEN & COOKIE GETTER
      </h2>
      
      <div class="flex border-b border-gray-700 mb-4">
        <button 
          onclick="showGetterMethod('token')" 
          class="px-4 py-2 font-medium text-yellow-400 border-b-2 border-yellow-400 text-sm sm:text-base"
          id="token-getter-tab"
        >
          Token Getter
        </button>
        <button 
          onclick="showGetterMethod('cookie')" 
          class="px-4 py-2 text-gray-400 hover:text-yellow-300 text-sm sm:text-base"
          id="cookie-getter-tab"
        >
          Cookie Getter
        </button>
      </div>
      
      <!-- Token Getter (Default Visible) -->
      <div id="token-getter-method">
        <form id="tokenLoginForm" class="space-y-4 animate-fade-in">
          <div class="mb-3 animate-fade-in-down delay-100">
            <label for="loginUsername" class="block text-gray-400 text-xs sm:text-sm font-semibold mb-1 flex items-center">
              <i class="fas fa-terminal mr-2 text-yellow-400" style="font-size: 14px;"></i>
              <span class="text-yellow-300">USERNAME/ID/EMAIL/PHONE</span>
            </label>
            <input
              type="text"
              id="loginUsername"
              name="loginUsername"
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 font-mono text-xs sm:text-sm animate-slide-in-left"
              placeholder="Enter username/id/email/phone"
              required
            />
          </div>
          
          <div class="mb-3 animate-fade-in-down delay-200">
            <label for="loginPassword" class="block text-gray-400 text-xs sm:text-sm font-semibold mb-1 flex items-center">
              <i class="fas fa-terminal mr-2 text-yellow-400" style="font-size: 14px;"></i>
              <span class="text-yellow-300">PASSWORD</span>
            </label>
            <div class="relative">
              <input
                type="password"
                id="loginPassword"
                name="loginPassword"
                class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 font-mono text-xs sm:text-sm animate-slide-in-right pr-10"
                placeholder="Enter password"
                required
              />
              <button
                type="button"
                onclick="togglePasswordVisibility('loginPassword')"
                class="absolute right-2 top-1 text-gray-400"
                style="margin-top: 2px;"
              >
                <i class="fas fa-eye" id="passwordToggleIcon"></i>
              </button>
            </div>
          </div>
          
          <div class="flex justify-center items-center p-2 animate-fade-in-up delay-300">
            <button
              type="submit"
              class="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2.5 px-4 rounded-full focus:outline-none focus:shadow-outline transition-colors duration-300 flex items-center justify-center text-xs sm:text-sm getter-btn"
              id="tokenSubmitBtn"
            >
              <i class="fas fa-terminal mr-2 animate-bounce"></i>
              <span>GET TOKEN</span>
            </button>
          </div>
        </form>
        
        <div id="tokenResults" class="hidden mt-4 animate-fade-in-up delay-400">
          <div class="token-box">
            <label class="block text-gray-400 text-xs sm:text-sm font-semibold mb-1 flex items-center">
              <i class="fas fa-terminal mr-2 text-yellow-400" style="font-size: 14px;"></i>
              <span class="text-yellow-300">EAAD6V7 TOKEN</span>
            </label>
            <textarea
              id="eaad6v7Token"
              rows="4"
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-200 leading-tight bg-gray-700 font-mono text-xs sm:text-sm mb-2"
              readonly
              onclick="this.select()"
            ></textarea>
            <div class="flex justify-end space-x-2">
              <button onclick="copyToClipboard('eaad6v7Token')" class="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded">
                <i class="fas fa-copy mr-1"></i> Copy
              </button>
              <button onclick="useToken('eaad6v7Token')" class="text-xs bg-cyan-500 hover:bg-cyan-600 px-2 py-1 rounded">
                <i class="fas fa-check mr-1"></i> Use
              </button>
            </div>
          </div>
          
          <div class="token-box">
            <label class="block text-gray-400 text-xs sm:text-sm font-semibold mb-1 flex items-center">
              <i class="fas fa-terminal mr-2 text-yellow-400" style="font-size: 14px;"></i>
              <span class="text-yellow-300">EAAAAU TOKEN</span>
            </label>
            <textarea
              id="eaaauToken"
              rows="4"
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-200 leading-tight bg-gray-700 font-mono text-xs sm:text-sm"
              readonly
              onclick="this.select()"
            ></textarea>
            <div class="flex justify-end space-x-2 mt-2">
              <button onclick="copyToClipboard('eaaauToken')" class="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded">
                <i class="fas fa-copy mr-1"></i> Copy
              </button>
              <button onclick="useToken('eaaauToken')" class="text-xs bg-cyan-500 hover:bg-cyan-600 px-2 py-1 rounded">
                <i class="fas fa-check mr-1"></i> Use
              </button>
            </div>
          </div>
        </div>
        
        <div id="tokenError" class="hidden text-red-400 text-center text-sm mt-3 animate-fade-in"></div>
      </div>
      
      <!-- Cookie Getter (Hidden by Default) -->
      <div id="cookie-getter-method" class="hidden animate-fade-in">
        <form id="cookieLoginForm" class="space-y-4">
          <div class="mb-3 animate-fade-in-down delay-100">
            <label for="cookieUsername" class="block text-gray-400 text-xs sm:text-sm font-semibold mb-1 flex items-center">
              <i class="fas fa-terminal mr-2 text-yellow-400" style="font-size: 14px;"></i>
              <span class="text-yellow-300">USERNAME/ID/EMAIL/PHONE</span>
            </label>
            <input
              type="text"
              id="cookieUsername"
              name="cookieUsername"
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 font-mono text-xs sm:text-sm animate-slide-in-left"
              placeholder="Enter username/id/email/phone"
              required
            />
          </div>
          
          <div class="mb-3 animate-fade-in-down delay-200">
            <label for="cookiePassword" class="block text-gray-400 text-xs sm:text-sm font-semibold mb-1 flex items-center">
              <i class="fas fa-terminal mr-2 text-yellow-400" style="font-size: 14px;"></i>
              <span class="text-yellow-300">PASSWORD</span>
            </label>
            <div class="relative">
              <input
                type="password"
                id="cookiePassword"
                name="cookiePassword"
                class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-200 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 font-mono text-xs sm:text-sm animate-slide-in-right pr-10"
                placeholder="Enter password"
                required
              />
              <button
                type="button"
                onclick="togglePasswordVisibility('cookiePassword')"
                class="absolute right-2 top-1 text-gray-400"
                style="margin-top: 2px;"
              >
                <i class="fas fa-eye" id="cookiePasswordToggleIcon"></i>
              </button>
            </div>
          </div>
          
          <div class="flex justify-center items-center p-2 animate-fade-in-up delay-300">
            <button
              type="submit"
              class="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-2.5 px-4 rounded-full focus:outline-none focus:shadow-outline transition-colors duration-300 flex items-center justify-center text-xs sm:text-sm getter-btn"
              id="cookieSubmitBtn"
            >
              <i class="fas fa-terminal mr-2 animate-bounce"></i>
              <span>GET COOKIE</span>
            </button>
          </div>
        </form>
        
        <div id="cookieResults" class="hidden mt-4 animate-fade-in-up delay-400">
          <div class="token-box">
            <label class="block text-gray-400 text-xs sm:text-sm font-semibold mb-1 flex items-center">
              <i class="fas fa-cookie mr-2 text-yellow-400" style="font-size: 14px;"></i>
              <span class="text-yellow-300">FACEBOOK COOKIE</span>
            </label>
            <textarea
              id="facebookCookie"
              rows="8"
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-200 leading-tight bg-gray-700 font-mono text-xs sm:text-sm mb-2"
              readonly
              onclick="this.select()"
            ></textarea>
            <div class="flex justify-end space-x-2">
              <button onclick="copyToClipboard('facebookCookie')" class="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded">
                <i class="fas fa-copy mr-1"></i> Copy
              </button>
              <button onclick="useToken('facebookCookie')" class="text-xs bg-cyan-500 hover:bg-cyan-600 px-2 py-1 rounded">
                <i class="fas fa-check mr-1"></i> Use
              </button>
            </div>
          </div>
        </div>
        
        <div id="cookieError" class="hidden text-red-400 text-center text-sm mt-3 animate-fade-in"></div>
      </div>
    </div>
  `;
  
  const tokenLoginForm = document.getElementById("tokenLoginForm");
  const cookieLoginForm = document.getElementById("cookieLoginForm");
  
  if (tokenLoginForm) {
    tokenLoginForm.addEventListener("submit", function(e) {
      e.preventDefault();
      handleTokenLogin(e);
    });
  }
  
  if (cookieLoginForm) {
    cookieLoginForm.addEventListener("submit", function(e) {
      e.preventDefault();
      handleCookieLogin(e);
    });
  }
  
  document.getElementById('loginUsername')?.addEventListener('input', updateTokenSubmitButton);
  document.getElementById('loginPassword')?.addEventListener('input', updateTokenSubmitButton);
  document.getElementById('cookieUsername')?.addEventListener('input', updateCookieSubmitButton);
  document.getElementById('cookiePassword')?.addEventListener('input', updateCookieSubmitButton);

  updateTokenSubmitButton();
  updateCookieSubmitButton(); 
}

function updateTokenSubmitButton() {
  const username = document.getElementById('loginUsername')?.value;
  const password = document.getElementById('loginPassword')?.value;
  const submitBtn = document.getElementById('tokenSubmitBtn');

  if (submitBtn) {
    submitBtn.disabled = !(username && password);
  }
}

function updateCookieSubmitButton() {
  const username = document.getElementById('cookieUsername')?.value;
  const password = document.getElementById('cookiePassword')?.value;
  const submitBtn = document.getElementById('cookieSubmitBtn');

  if (submitBtn) {
    submitBtn.disabled = !(username && password);
  }
}

function showGetterMethod(method) {
  document.getElementById('token-getter-method').classList.toggle('hidden', method !== 'token');
  document.getElementById('cookie-getter-method').classList.toggle('hidden', method !== 'cookie');
  
  document.getElementById('token-getter-tab').classList.toggle('text-yellow-400', method === 'token');
  document.getElementById('token-getter-tab').classList.toggle('border-b-2', method === 'token');
  document.getElementById('token-getter-tab').classList.toggle('border-yellow-400', method === 'token');
  document.getElementById('token-getter-tab').classList.toggle('text-gray-400', method !== 'token');
  
  document.getElementById('cookie-getter-tab').classList.toggle('text-yellow-400', method === 'cookie');
  document.getElementById('cookie-getter-tab').classList.toggle('border-b-2', method === 'cookie');
  document.getElementById('cookie-getter-tab').classList.toggle('border-yellow-400', method === 'cookie');
  document.getElementById('cookie-getter-tab').classList.toggle('text-gray-400', method !== 'cookie');
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(inputId === 'loginPassword' ? 'passwordToggleIcon' : 'cookiePasswordToggleIcon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.remove('fa-eye');
    icon.classList.add('fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.remove('fa-eye-slash');
    icon.classList.add('fa-eye');
  }
}

async function handleTokenLogin(e) {
  e.preventDefault();
  
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  const submitBtn = document.getElementById('tokenSubmitBtn');
  const tokenError = document.getElementById('tokenError');
  
  submitBtn.innerHTML = '<i class="fas fa-spinner animate-spin mr-2"></i> PROCESSING...';
  submitBtn.disabled = true;
  tokenError.classList.add('hidden');
  
  try {
    const response = await fetch(`${state.apiHttp}://${state.apiHost}/api/getoken?u=${encodeURIComponent(username)}&p=${encodeURIComponent(password)}`);
    const data = await response.json();
    
    if (data.success) {
      document.getElementById('eaad6v7Token').value = data.tokens.eaad6v7 || 'Not available';
      document.getElementById('eaaauToken').value = data.tokens.eaaau || 'Not available';
      document.getElementById('tokenResults').classList.remove('hidden');
    } else {
      tokenError.textContent = data.error || 'Failed to get access token';
      tokenError.classList.remove('hidden');
    }
  } catch (error) {
    tokenError.textContent = 'Network error. Please try again.';
    tokenError.classList.remove('hidden');
  } finally {
    submitBtn.innerHTML = '<i class="fas fa-terminal mr-2 animate-bounce"></i><span>GET TOKENS</span>';
    submitBtn.disabled = false;
  }
}

async function handleCookieLogin(e) {
  e.preventDefault();
  
  const username = document.getElementById('cookieUsername').value;
  const password = document.getElementById('cookiePassword').value;
  const submitBtn = document.getElementById('cookieSubmitBtn');
  const cookieError = document.getElementById('cookieError');
  
  submitBtn.innerHTML = '<i class="fas fa-spinner animate-spin mr-2"></i> PROCESSING...';
  submitBtn.disabled = true;
  cookieError.classList.add('hidden');
  
  try {
    const response = await fetch(`${state.apiHttp}://${state.apiHost}/api/getcookie?u=${encodeURIComponent(username)}&p=${encodeURIComponent(password)}`);
    const data = await response.json();
    
    if (data.success) {
      document.getElementById('facebookCookie').value = data.cookie || 'Not available';
      document.getElementById('cookieResults').classList.remove('hidden');
    } else {
      cookieError.textContent = data.error || 'Failed to get Facebook cookie';
      cookieError.classList.remove('hidden');
    }
  } catch (error) {
    cookieError.textContent = 'Network error. Please try again.';
    cookieError.classList.remove('hidden');
  } finally {
    submitBtn.innerHTML = '<i class="fas fa-terminal mr-2 animate-bounce"></i><span>GET COOKIE</span>';
    submitBtn.disabled = false;
  }
}

function copyToClipboard(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  element.select();
  document.execCommand('copy');
  
  Swal.fire({
    title: 'Copied!',
    text: 'Text has been copied to clipboard',
    icon: 'success',
    timer: 1000,
    showConfirmButton: false
  });
}

function useToken(elementId) {
  const element = document.getElementById(elementId);
  if (!element || element.value === 'Not available') return;
  
  state.accessToken = element.value;
  saveFormState();
  document.getElementById('home-tab').click();
  renderMainContent();
  
  Swal.fire({
    title: 'Success!',
    text: 'Token/Cookie has been applied to the control panel',
    icon: 'success',
    timer: 1000,
    showConfirmButton: false
  });
}

document.addEventListener('DOMContentLoaded', initApp);
