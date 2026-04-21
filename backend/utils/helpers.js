// ── Booking status constants ──────────────────────────────────────
const BOOKING_STATUS = {
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  PENDING:   'PENDING',
};

// ── Payment status constants ──────────────────────────────────────
const PAYMENT_STATUS = {
  SUCCESS: 'SUCCESS',
  FAILED:  'FAILED',
  PENDING: 'PENDING',
};

// ── Seat type constants ───────────────────────────────────────────
const SEAT_TYPE = {
  VIP:     'VIP',
  PREMIUM: 'PREMIUM',
  REGULAR: 'REGULAR',
};

// ── Format currency (INR) ────────────────────────────────────────
const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);

// ── Format date for display ───────────────────────────────────────
const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

// ── Paginate query helper ─────────────────────────────────────────
const paginate = (req) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  return { limit, offset: (page - 1) * limit, page };
};

// ── Build success response ────────────────────────────────────────
const success = (res, data, statusCode = 200, message = 'Success') =>
  res.status(statusCode).json({ success: true, message, data });

// ── Build error response ──────────────────────────────────────────
const error = (res, message, statusCode = 400) =>
  res.status(statusCode).json({ success: false, message });

module.exports = {
  BOOKING_STATUS,
  PAYMENT_STATUS,
  SEAT_TYPE,
  formatCurrency,
  formatDate,
  paginate,
  success,
  error,
};
