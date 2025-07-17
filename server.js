const express = require('express');
const dotenv = require('dotenv');
const sequelize = require('./config/database'); 
const cors = require('cors');  // Add this import
const expressOasGenerator = require('express-oas-generator');


dotenv.config();

const app = express();
expressOasGenerator.init(app, {}, './openapi.json', 5000);

// Ensure database connection is established
sequelize.authenticate()
  .then(() => console.log('Connected to MySQL via Sequelize'))
  .catch(err => console.error('Failed to connect to MySQL:', err));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Enable CORS for all origins (for local development)
app.use(cors());  // Add this line to enable CORS for all routes

// Middleware
app.use(express.json());

// Routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);
