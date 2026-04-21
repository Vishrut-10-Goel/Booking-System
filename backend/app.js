require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const path         = require('path');

// ── Security middleware ───────────────────────────────────────────
const { helmetMiddleware, apiLimiter, authLimiter } = require('./middleware/security');

// ── Error handler ─────────────────────────────────────────────────
const errorHandler = require('./middleware/errorHandler');

// ── Route imports ─────────────────────────────────────────────────
const authRoutes    = require('./routes/authRoutes');
const eventRoutes   = require('./routes/eventRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const reviewRoutes  = require('./routes/reviewRoutes');
const adminRoutes   = require('./routes/adminRoutes');
const foodRoutes    = require('./routes/foodRoutes');
const ticketRoutes  = require('./routes/ticketRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminAuthRoute = require('./routes/adminAuthRoute');

// ── Start cron jobs ───────────────────────────────────────────────
require('./jobs/emailScheduler');

const app = express();

// ── Core middleware ───────────────────────────────────────────────
app.use(helmetMiddleware);
// In production (Railway) the frontend is served from the same origin,
// so CORS is only needed when FRONTEND_URL is set to a different domain.
app.use(cors({
  origin:  process.env.FRONTEND_URL || true,   // true = reflect request origin
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// ── Serve static frontend files ───────────────────────────────────
// In this monorepo the frontend folder sits one level above backend:
//   eventra-v4/
//     backend/   ← we are here
//     frontend/  ← static files live here
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Global rate limiter ───────────────────────────────────────────
app.use('/api/', apiLimiter);

// ── Health check ─────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success:   true,
    message:   'EVENTRA API is running',
    version:   '3.0.0',
    timestamp: new Date(),
  });
});

// ── Mount routes ──────────────────────────────────────────────────
app.use('/api/auth',     authLimiter, authRoutes);
app.use('/api/auth',     adminAuthRoute);
app.use('/api/events',   eventRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews',  reviewRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/food',     foodRoutes);
app.use('/api/tickets',  ticketRoutes);
app.use('/api/payments', paymentRoutes);

// ── SPA fallback – serve index.html for non-/api routes ─────────
// This lets the browser handle client-side navigation.
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    // True 404 for API paths
    return res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` });
  }
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// ── Global error handler (must be last) ──────────────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 EVENTRA API running → http://localhost:${PORT}`);
  console.log(`📋 Health check       → http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
