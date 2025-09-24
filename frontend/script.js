// script.js

const apiUrl = 'https://www.julian-labs.com/api';  // backend URL

/**
 * Tab-switcher: show only the requested panel,
 * activate its button, and auto-refresh users if needed.
 */
function showTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));

  const panel = document.getElementById(tabId);
  if (panel) panel.style.display = 'block';
  if (btn) btn.classList.add('active');

  if (tabId === 'users') fetchUsers();
}

// —————————————————————————————————————————
// 1) AJAX (Fetch API) Login
// —————————————————————————————————————————
document.getElementById('loginForm')
  .addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const msg = document.getElementById('loginMessage');

    try {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const json = await res.json();
      if (res.ok) {
        msg.textContent = `✅ Fetch login success! Token: ${json.token}`;
        msg.style.color = 'green';
      } else {
        msg.textContent = json.message || 'Fetch login failed';
        msg.style.color = 'red';
      }
    } catch {
      msg.textContent = 'Network error';
      msg.style.color = 'red';
    }
  });

// —————————————————————————————————————————
// 2) XHR Login
// —————————————————————————————————————————
document.getElementById('xhrLoginForm')
  .addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('xhrEmail').value;
    const password = document.getElementById('xhrPassword').value;
    const msg = document.getElementById('xhrMessage');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiUrl}/auth/login`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        const json = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) {
          msg.textContent = `✅ XHR login success! Token: ${json.token}`;
          msg.style.color = 'green';
        } else {
          msg.textContent = json.message || 'XHR login failed';
          msg.style.color = 'red';
        }
      }
    };
    xhr.send(JSON.stringify({ email, password }));
  });

// —————————————————————————————————————————
// 3) jQuery Login
// —————————————————————————————————————————
$('#jqueryLoginForm').on('submit', function(e) {
  e.preventDefault();
  const email = $('#jqEmail').val();
  const password = $('#jqPassword').val();
  const msg    = $('#jqMessage');

  $.ajax({
    url: `${apiUrl}/auth/login`,
    method: 'POST',
    contentType: 'application/json',
    data: JSON.stringify({ email, password }),
    success(data) {
      msg.text(`✅ jQuery login success! Token: ${data.token}`)
         .css('color', 'green');
    },
    error(xhr) {
      const json = xhr.responseJSON || {};
      msg.text(json.message || 'jQuery login failed')
         .css('color', 'red');
    }
  });
});

// —————————————————————————————————————————
// Register form (unchanged)
// —————————————————————————————————————————
document.getElementById('registerForm')
  .addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const msg = document.getElementById('registerMessage');

    try {
      const res = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const json = await res.json();
      if (res.ok) {
        msg.textContent = '✅ Registration successful!';
        msg.style.color = 'green';
      } else {
        msg.textContent = json.message || 'Registration failed';
        msg.style.color = 'red';
      }
    } catch {
      msg.textContent = 'Network error';
      msg.style.color = 'red';
    }
  });

// —————————————————————————————————————————
// Fetch & render Users
// —————————————————————————————————————————
async function fetchUsers() {
  const ul = document.getElementById('usersList');
  ul.innerHTML = '<li>Loading…</li>';
  try {
    const res = await fetch(`${apiUrl}/auth/users`);
    const list = await res.json();
    ul.innerHTML = '';
    list.forEach(u => {
      const li = document.createElement('li');
      li.textContent = u.email;
      ul.appendChild(li);
    });
  } catch {
    ul.innerHTML = '<li>Error loading users</li>';
  }
}

const KEY_STORAGE = 'openai_api_key';        // change if you like

function getApiKey() {
  return sessionStorage.getItem(KEY_STORAGE) || "";   // ephemeral (clears on tab close)
}
function saveApiKey(k) {
  const v = (k || "").trim();
  if (!v) return clearApiKey();
  sessionStorage.setItem(KEY_STORAGE, v);
}
function clearApiKey() {
  sessionStorage.removeItem(KEY_STORAGE);
}

const keyInput  = document.getElementById('openai-key');
const keyStatus = document.getElementById('key-status');

document.getElementById('save-key').addEventListener('click', () => {
  saveApiKey(keyInput.value);
  keyInput.value = '';
  keyStatus.style.display = 'inline';
  keyStatus.textContent = 'Saved to this browser (session)';
  setTimeout(() => (keyStatus.style.display = 'none'), 2000);
});

document.getElementById('clear-key').addEventListener('click', () => {
  clearApiKey();
  keyStatus.style.display = 'inline';
  keyStatus.textContent = 'Key cleared';
  setTimeout(() => (keyStatus.style.display = 'none'), 1500);
});

if (getApiKey()) {
  keyStatus.style.display = 'inline';
  keyStatus.textContent = 'A key is saved (session)';
  setTimeout(() => (keyStatus.style.display = 'none'), 2000);
}



document.addEventListener("DOMContentLoaded", function () {
  const chatbotContainer = document.getElementById("chatbot-container");
  const closeBtn = document.getElementById("close-btn");
  const sendBtn = document.getElementById("send-btn");
  const chatbotInput = document.getElementById("chatbot-input");
  const chatbotMessages = document.getElementById("chatbot-messages");

  const chatbotIcon = document.getElementById("chatbot-icon");
  const closeButton = document.getElementById("close-btn");

  // Toggle chatbot visibility when clicking the icon
  // Show chatbot when clicking the icon
  chatbotIcon.addEventListener("click", function () {
    chatbotContainer.classList.remove("hidden");
    chatbotIcon.style.display = "none"; // Hide chat icon
  });

  // Also toggle when clicking the close button
  closeButton.addEventListener("click", function () {
    chatbotContainer.classList.add("hidden");
    chatbotIcon.style.display = "flex"; // Show chat icon again
  });

  sendBtn.addEventListener("click", sendMessage);
  chatbotInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      sendMessage();
    }
  });

  function sendMessage() {
    const userMessage = chatbotInput.value.trim();
    if (userMessage) {
      appendMessage("user", userMessage);
      chatbotInput.value = "";
      getBotResponse(userMessage);
    }
  }

  function appendMessage(sender, message) {
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", sender);
    messageElement.textContent = message;
    chatbotMessages.appendChild(messageElement);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
  }
  async function getBotResponse(userMessage) {
    const apiKey = getApiKey();
    if (!apiKey) {
      appendMessage("bot", "⚠️ Add your OpenAI API key above to chat.");
      return;
    }
  
    const resp = await fetch(`${apiUrl}/chat`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,     // ← BYOK
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5-nano",
        input: userMessage,
        max_output_tokens: 256,
        reasoning: { effort: "low" },
        text: { format: { type: "text" }, verbosity: "low" }
      }),
    });
  
    if (!resp.ok) {
      const err = await resp.text();
      appendMessage("bot", `Error: ${resp.status} ${resp.statusText}`);
      console.error(err);
      return;
    }
  
    const data = await resp.json();
    const botMessage =
      data.output_text ||
      (data.output ?? [])
        .flatMap(o => o.content ?? [])
        .map(c => c.text || "")
        .join("") || "(no content)";
  
    appendMessage("bot", botMessage);
  }
  
});


// Manual “Refresh Users”
document.getElementById('refreshUsers')
  .addEventListener('click', fetchUsers);

// —————————————————————————————————————————
// Init on page load
// —————————————————————————————————————————
document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.tab').click();
});

document.addEventListener('DOMContentLoaded', () => {
  const log   = document.getElementById('ws-log');
  const input = document.getElementById('ws-input');
  const send  = document.getElementById('ws-send');
  const keyInput   = document.getElementById('ws-openai-key');
  const keyStatus  = document.getElementById('ws-key-status');
  const saveKeyBtn = document.getElementById('ws-save-key');
  const clearKeyBtn= document.getElementById('ws-clear-key');

  const WS_KEY_STORAGE = 'ws_openai_api_key';
  const getKey   = () => sessionStorage.getItem(WS_KEY_STORAGE) || '';
  const saveKey  = k => k ? sessionStorage.setItem(WS_KEY_STORAGE, k.trim()) : sessionStorage.removeItem(WS_KEY_STORAGE);
  const clearKey = () => sessionStorage.removeItem(WS_KEY_STORAGE);

  saveKeyBtn.addEventListener('click', () => {
    saveKey(keyInput.value);
    keyInput.value = '';
    keyStatus.textContent = 'Saved';
    keyStatus.style.display = 'inline';
    setTimeout(() => keyStatus.style.display = 'none', 2000);
  });
  clearKeyBtn.addEventListener('click', () => {
    clearKey();
    keyStatus.textContent = 'Key cleared';
    keyStatus.style.display = 'inline';
    setTimeout(() => keyStatus.style.display = 'none', 1500);
  });

  // Connect to your backend, passing the key as a query parameter
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const key   = encodeURIComponent(getKey());
  const ws    = new WebSocket(`${proto}://${location.host}/ws?key=${key}`);

  function append(role, text) {
    const div = document.createElement('div');
    div.className = `ws-message ${role}`;
    div.textContent = `${role === 'user' ? 'You' : 'Bot'}: ${text}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  ws.addEventListener('open',  () => append('bot','🔌 Connected to WS'));
  ws.addEventListener('close', () => append('bot','❌ Disconnected'));
  ws.addEventListener('error', () => append('bot','⚠️ WS Error'));

  ws.addEventListener('message', evt => {
    const data = JSON.parse(evt.data);
    if (data.type === 'response.delta') {
      const pieces = data.delta?.output ?? [];
      for (const p of pieces) {
        if (Array.isArray(p.content)) {
          for (const c of p.content) {
            if (c.type === 'output_text_delta' && c.text) append('bot', c.text);
          }
        }
      }
    }
    if (data.type === 'response.completed') append('bot','(done)');
    if (data.type === 'error') append('bot','⚠️ ' + (data.error?.message || 'Error'));
  });

  function sendMsg() {
    const msg = input.value.trim();
    if (!msg) return;
    append('user', msg);
    ws.send(JSON.stringify({ text: msg }));
    input.value = '';
  }

  send.addEventListener('click', sendMsg);
  input.addEventListener('keypress', e => { if (e.key === 'Enter') sendMsg(); });
});
