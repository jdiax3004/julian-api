const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'mysql',
  logging: false,
});

sequelize.sync({ alter: true })  // ✅ This will create the table if it doesn't exist
  .then(() => console.log('Database & tables synchronized'))
  .catch(err => console.error('Sequelize sync error:', err));

module.exports = sequelize;
