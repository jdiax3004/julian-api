const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // ✅ Import Sequelize Model

const router = express.Router();

// Register Route
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create User in MySQL using Sequelize
    const newUser = await User.create({ email, password: hashedPassword });

    res.status(201).json({ message: 'User registered', userId: newUser.id });
  } catch (error) {
    res.status(500).json({ error: 'Error creating user' });
  }
});

// Login Route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    // Generate JWT Token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.json({ message: 'Login successful', token });
  } catch (error) {
    res.status(500).json({ error: 'Error logging in' });
  }
});

// ========= Flex: configurable echo endpoint =========
let flexResponsePayload = { message: 'No response configured yet' };

// Configure the response that /flex will return
router.post('/flex/configure', (req, res) => {
  try {
    flexResponsePayload = req.body;
    res.json({ message: 'Response configured successfully', configured: flexResponsePayload });
  } catch (error) {
    res.status(500).json({ error: 'Error configuring response' });
  }
});

// Login-style endpoint that always replies with the configured payload
router.post('/flex', (req, res) => {
  try {
    // req.body contains { username, password } but we ignore auth logic
    res.json(flexResponsePayload);
  } catch (error) {
    res.status(500).json({ error: 'Error processing flex request' });
  }
});

// Get the currently configured response (for display)
router.get('/flex/configure', (req, res) => {
  res.json(flexResponsePayload);
});

// Reset the configured response back to default
router.delete('/flex/configure', (req, res) => {
  flexResponsePayload = { message: 'No response configured yet' };
  res.json({ message: 'Response reset to default', configured: flexResponsePayload });
});

// List all users
router.get('/users', async (req, res) => {
  try {
      const users = await User.findAll();  // Fetch all users
      res.json(users);
  } catch (err) {
      console.error('Error fetching users:', err);
      res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;
