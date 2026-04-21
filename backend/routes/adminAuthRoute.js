/**
 * Special admin login route - hardcoded credentials bypass
 * POST /api/auth/admin-login
 */
const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const db      = require('../config/db');

const ADMIN_EMAIL    = 'goelvishrut7@gmail.com';
const ADMIN_PASSWORD = 'asdfghjkl';

router.post('/admin-login', async (req, res) => {
  const { email, password } = req.body;
  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      message: 'To list your event, contact goelvishrut7@gmail.com',
    });
  }

  // Look up admin user in DB (user_id=6 seeded as goelvishrut7@gmail.com)
  // Fall back to creating minimal session if not found
  let user_id = 6;
  let full_name = 'Vishrut Goel';
  try {
    const [rows] = await db.query('SELECT user_id, full_name FROM users WHERE email = ? LIMIT 1', [ADMIN_EMAIL]);
    if (rows.length > 0) { user_id = rows[0].user_id; full_name = rows[0].full_name; }
  } catch(_) {}

  const token = jwt.sign(
    { user_id, email: ADMIN_EMAIL, is_admin: true },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  res.json({
    success: true,
    message: 'Admin login successful',
    data: { user_id, full_name, email: ADMIN_EMAIL, is_admin: true, token },
  });
});

module.exports = router;
