const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('../config/db');
const { validationResult } = require('express-validator');
const emailSvc = require('../services/emailService');

// ──────────────────────────────────────────────
// POST /api/auth/register
// ──────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { full_name, email, password } = req.body;

    // Check if email already taken
    const [existing] = await db.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    // Hash password
    const salt          = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const [result] = await db.query(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      [full_name, email, password_hash]
    );

    const token = generateToken(result.insertId, email, false);

    // Fire-and-forget welcome email
    emailSvc.sendSafe(emailSvc.sendWelcomeEmail, { full_name, email });

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user_id:   result.insertId,
        full_name,
        email,
        token,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// POST /api/auth/login
// ──────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = generateToken(user.user_id, user.email, !!user.is_admin);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user_id:   user.user_id,
        full_name: user.full_name,
        email:     user.email,
        token,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// GET /api/auth/me   (protected)
// ──────────────────────────────────────────────
const getMe = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT user_id, full_name, email, created_at FROM users WHERE user_id = ?',
      [req.user.user_id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
const generateToken = (user_id, email, is_admin) =>
  jwt.sign(
    { user_id, email, is_admin },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

module.exports = { register, login, getMe };
