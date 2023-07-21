const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// POST - User Registration
router.post('/register', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      // Generate a salt and hash the password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      
      // Create a new user with the hashed password
      const newUser = new User({
        email,
        password: hashedPassword
      });

      // Save the user to the database
      const savedUser = await newUser.save();
  
      res.status(200).json({ message: 'User registered successfully', user: savedUser });
    } catch (error) {
      console.error('Failed to register user:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

// POST - User Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Compare the password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate a JSON Web Token (JWT)
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(200).json({ token, req_headers:req.headers });
  } catch (error) {
    console.error('Failed to log in:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET - Users
router.get('/users', async (req, res) => {
    try {
      const users = await User.find({}, '-password');
      res.status(200).json(users);
    } catch (error) {
      console.error('Failed to get users:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  

module.exports = router;
