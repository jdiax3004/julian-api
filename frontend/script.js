// ========= Config =========
const apiUrl = "https://www.julian-labs.com/api"; // backend URL
const WS_URL = "wss://www.julian-labs.com/ws/echo";

// ========= Simple Router (show/hide sections) =========
function showSection(id) {
  document.querySelectorAll("section").forEach(s => s.classList.add("hidden"));
  const target = document.getElementById(id);
  if (target) target.classList.remove("hidden");

  if (id === "users") fetchUsers();
}
window.showSection = showSection;

// Default view
document.addEventListener("DOMContentLoaded", () => {
  showSection("menu");
  // Show key status if one exists
  if (cbGetKey()) cbShowKeyStatus("A key is saved (session)", 1800);
});

// ========= AJAX (Fetch) Login =========
document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;
  const msg = document.getElementById("loginMessage");

  try {
    const res = await fetch(`${apiUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (res.ok) {
      msg.textContent = `✅ Fetch login success! Token: ${json.token}`;
      msg.className = "mt-2 text-sm text-green-600";
    } else {
      msg.textContent = json.message || "Fetch login failed";
      msg.className = "mt-2 text-sm text-red-600";
    }
  } catch {
    msg.textContent = "Network error";
    msg.className = "mt-2 text-sm text-red-600";
  }
});

// ========= XHR Login =========
document.getElementById("xhrLoginForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = document.getElementById("xhrEmail").value;
  const password = document.getElementById("xhrPassword").value;
  const msg = document.getElementById("xhrMessage");

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${apiUrl}/auth/login`);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.onreadystatechange = () => {
    if (xhr.readyState === 4) {
      const json = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 200 && xhr.status < 300) {
        msg.textContent = `✅ XHR login success! Token: ${json.token}`;
        msg.className = "mt-2 text-sm text-green-600";
      } else {
        msg.textContent = json.message || "XHR login failed";
        msg.className = "mt-2 text-sm text-red-600";
      }
    }
  };
  xhr.send(JSON.stringify({ email, password }));
});

// ========= jQuery Login =========
$("#jqueryLoginForm")?.on("submit", function (e) {
  e.preventDefault();
  const email = $("#jqEmail").val();
  const password = $("#jqPassword").val();
  const msg = $("#jqMessage");

  $.ajax({
    url: `${apiUrl}/auth/login`,
    method: "POST",
    contentType: "application/json",
    data: JSON.stringify({ email, password }),
    success(data) {
      msg.text(`✅ jQuery login success! Token: ${data.token}`)
         .attr("class", "mt-2 text-sm text-green-600");
    },
    error(xhr) {
      const json = xhr.responseJSON || {};
      msg.text(json.message || "jQuery login failed")
         .attr("class", "mt-2 text-sm text-red-600");
    },
  });
});

// ========= Register =========
document.getElementById("registerForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("registerEmail").value;
  const password = document.getElementById("registerPassword").value;
  const msg = document.getElementById("registerMessage");

  try {
    const res = await fetch(`${apiUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json();
    if (res.ok) {
      msg.textContent = "✅ Registration successful!";
      msg.className = "mt-2 text-sm text-green-600";
    } else {
      msg.textContent = json.message || "Registration failed";
      msg.className = "mt-2 text-sm text-red-600";
    }
  } catch {
    msg.textContent = "Network error";
    msg.className = "mt-2 text-sm text-red-600";
  }
});

// ========= Users =========
async function fetchUsers() {
  const ul = document.getElementById("usersList");
  if (!ul) return;
  ul.innerHTML = `<li class="px-3 py-2 bg-gray-100 rounded-lg text-gray-800">Loading…</li>`;
  try {
    const res = await fetch(`${apiUrl}/auth/users`);
    const list = await res.json();
    ul.innerHTML = "";
    (Array.isArray(list) ? list : []).forEach((u) => {
      const li = document.createElement("li");
      li.className = "px-3 py-2 bg-gray-100 rounded-lg text-gray-800";
      li.textContent = u.email || "(no email)";
      ul.appendChild(li);
    });
  } catch {
    ul.innerHTML = `<li class="px-3 py-2 bg-gray-100 rounded-lg text-red-600">Error loading users</li>`;
  }
}
document.getElementById("refreshUsers")?.addEventListener("click", fetchUsers);

// ========= WebSocket Chat =========
let wsSocket = null;
const wsStatusEl = document.getElementById("ws-status");
const wsMessagesEl = document.getElementById("ws-messages");
const wsForm = document.getElementById("ws-form");
const wsInput = document.getElementById("ws-input");

document.getElementById("ws-connect")?.addEventListener("click", wsConnect);
document.getElementById("ws-disconnect")?.addEventListener("click", wsDisconnect);

function wsSetStatus(connected) {
  if (!wsStatusEl) return;
  wsStatusEl.textContent = connected ? "🟢 Connected" : "🔴 Disconnected";
  wsStatusEl.className = connected ? "text-green-600" : "text-red-600";
}

function wsAppendMessage(text, type = "in") {
  if (!wsMessagesEl) return;
  const bubble = document.createElement("div");
  bubble.className =
    type === "out"
      ? "ml-auto bg-blue-600 text-white px-4 py-2 rounded-2xl max-w-[80%]"
      : "mr-auto bg-gray-200 text-gray-800 px-4 py-2 rounded-2xl max-w-[80%]";
  bubble.textContent = text;
  wsMessagesEl.appendChild(bubble);
  wsMessagesEl.scrollTop = wsMessagesEl.scrollHeight;
}

function wsConnect() {
  if (wsSocket && wsSocket.readyState === WebSocket.OPEN) return;
  wsSocket = new WebSocket(WS_URL);

  wsSocket.addEventListener("open", () => wsSetStatus(true));
  wsSocket.addEventListener("message", (e) => wsAppendMessage(e.data, "in"));
  wsSocket.addEventListener("close", () => wsSetStatus(false));
  wsSocket.addEventListener("error", (err) => {
    console.error("WS error", err);
    try { wsSocket.close(); } catch {}
  });
}

function wsDisconnect() {
  if (wsSocket) {
    wsSocket.close(1000, "Manual disconnect");
    wsSocket = null;
    wsSetStatus(false);
  }
}

wsForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = wsInput.value.trim();
  if (msg && wsSocket && wsSocket.readyState === WebSocket.OPEN) {
    wsSocket.send(msg);
    wsAppendMessage(msg, "out");
    wsInput.value = "";
  }
});

// ========= Chatbot (BYOK) =========
const KEY_STORAGE = "openai_api_key_session"; // session-scoped

function cbGetKey() {
  return sessionStorage.getItem(KEY_STORAGE) || "";
}
function cbSaveKey(k) {
  const v = (k || "").trim();
  if (!v) return cbClearKey();
  sessionStorage.setItem(KEY_STORAGE, v);
}
function cbClearKey() {
  sessionStorage.removeItem(KEY_STORAGE);
}
function cbShowKeyStatus(text = "Saved", ms = 1500) {
  const el = document.getElementById("cb-key-status");
  if (!el) return;
  el.textContent = text;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), ms);
}

const cbKeyInput   = document.getElementById("cb-key");
const cbSaveBtn    = document.getElementById("cb-save-key");
const cbClearBtn   = document.getElementById("cb-clear-key");
const cbSendBtn    = document.getElementById("cb-send-btn");
const cbInput      = document.getElementById("cb-input");
const cbMessagesEl = document.getElementById("cb-messages");

cbSaveBtn?.addEventListener("click", () => {
  cbSaveKey(cbKeyInput?.value || "");
  if (cbKeyInput) cbKeyInput.value = "";
  cbShowKeyStatus("Saved to this browser (session)", 1800);
});

cbClearBtn?.addEventListener("click", () => {
  cbClearKey();
  cbShowKeyStatus("Key cleared", 1200);
});

function cbAppendMessage(sender, text) {
  if (!cbMessagesEl) return;
  const div = document.createElement("div");
  const base = "px-4 py-2 rounded-2xl max-w-[80%]";
  if (sender === "user") {
    div.className = `ml-auto bg-blue-600 text-white ${base}`;
  } else {
    div.className = `mr-auto bg-gray-200 text-gray-800 ${base}`;
  }
  div.textContent = text;
  cbMessagesEl.appendChild(div);
  cbMessagesEl.scrollTop = cbMessagesEl.scrollHeight;
}

async function cbSendMessage() {
  const userMessage = (cbInput?.value || "").trim();
  if (!userMessage) return;
  const apiKey = cbGetKey();
  if (!apiKey) {
    cbAppendMessage("bot", "⚠️ Add your OpenAI API key above to chat.");
    return;
  }

  cbAppendMessage("user", userMessage);
  if (cbInput) cbInput.value = "";

  try {
    const resp = await fetch(`${apiUrl}/chat`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`, // BYOK
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
      cbAppendMessage("bot", `Error: ${resp.status} ${resp.statusText}`);
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

    cbAppendMessage("bot", botMessage);
  } catch (e) {
    console.error(e);
    cbAppendMessage("bot", "Network error");
  }
}

cbSendBtn?.addEventListener("click", cbSendMessage);
cbInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    cbSendMessage();
  }
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
