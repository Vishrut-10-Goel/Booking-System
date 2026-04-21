const mysql = require('mysql2/promise');
require('dotenv').config();

// Railway injects MYSQL* vars automatically; fall back to DB_* for local dev.
const pool = mysql.createPool({
  host:     process.env.MYSQLHOST     || process.env.DB_HOST     || 'localhost',
  port:     process.env.MYSQLPORT     || process.env.DB_PORT     || 3306,
  user:     process.env.MYSQLUSER     || process.env.DB_USER     || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME     || 'EVENTRA',
  waitForConnections: true,
  connectionLimit:    50,
  queueLimit:         0,
  connectTimeout:     20000,
  ssl: process.env.MYSQLHOST ? { rejectUnauthorized: false } : undefined,
});

// Test connection on startup
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL connected – EVENTRA database ready');
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  }
})();

module.exports = pool;
