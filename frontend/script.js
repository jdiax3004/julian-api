const apiUrl = 'http://localhost:3000/api/auth';  // Your backend URL

// Show specific tab
function showTab(tab) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tabContent => tabContent.style.display = 'none');
    
    const activeTab = document.getElementById(tab);
    if (activeTab) {
        activeTab.style.display = 'block';
    }
}

// Handle login form submission
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    const response = await fetch(`${apiUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    const result = await response.json();
    
    const messageElem = document.getElementById('loginMessage');
    
    if (response.ok) {
        messageElem.textContent = `Login successful! Token: ${result.token}`;
        messageElem.style.color = 'green';
    } else {
        messageElem.textContent = result.message;
        messageElem.style.color = 'red';
    }
});

// Handle register form submission
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;

    const response = await fetch(`${apiUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    const result = await response.json();
    
    const messageElem = document.getElementById('registerMessage');
    
    if (response.ok) {
        messageElem.textContent = 'Registration successful!';
        messageElem.style.color = 'green';
    } else {
        messageElem.textContent = result.message;
        messageElem.style.color = 'red';
    }
});

// Fetch and display users list
async function fetchUsers() {
    const response = await fetch(`${apiUrl}/users`);
    const users = await response.json();

    const usersList = document.getElementById('usersList');
    usersList.innerHTML = '';

    users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user.email;
        usersList.appendChild(li);
    });
}

// Show users tab and fetch users
document.getElementById('users').addEventListener('click', () => {
    fetchUsers();
});
