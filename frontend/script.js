// script.js

const apiUrl = 'https://julian-labs.com/api/auth';  // backend URL

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
      const res = await fetch(`${apiUrl}/login`, {
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
    xhr.open('POST', `${apiUrl}/login`);
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
    url: `${apiUrl}/login`,
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
      const res = await fetch(`${apiUrl}/register`, {
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
    const res = await fetch(`${apiUrl}/users`);
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

// Manual “Refresh Users”
document.getElementById('refreshUsers')
  .addEventListener('click', fetchUsers);

// —————————————————————————————————————————
// Init on page load
// —————————————————————————————————————————
document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('.tab').click();
});
