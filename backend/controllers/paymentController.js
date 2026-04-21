const db = require('../config/db');

// ──────────────────────────────────────────────
// GET /api/payments/booking/:bookingId   (protected – owner/admin)
// ──────────────────────────────────────────────
const getPaymentByBooking = async (req, res, next) => {
  try {
    const { bookingId } = req.params;

    const [rows] = await db.query(
      `SELECT p.*, b.user_id, b.booking_status,
              e.title AS event_title
       FROM payments p
       JOIN bookings b ON p.booking_id = b.booking_id
       JOIN events   e ON b.event_id   = e.event_id
       WHERE p.booking_id = ?`,
      [bookingId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const payment = rows[0];
    if (payment.user_id !== req.user.user_id && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// POST /api/payments/:bookingId/verify
// Simulate payment gateway callback / manual verify
// In a real app Razorpay/Stripe webhooks would call this
// ──────────────────────────────────────────────
const verifyPayment = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const { bookingId }           = req.params;
    const { payment_status, payment_method } = req.body;

    if (!['SUCCESS', 'FAILED'].includes(payment_status)) {
      conn.release();
      return res.status(400).json({ success: false, message: 'payment_status must be SUCCESS or FAILED' });
    }

    const [rows] = await conn.query(
      'SELECT p.*, b.user_id FROM payments p JOIN bookings b ON p.booking_id = b.booking_id WHERE p.booking_id = ?',
      [bookingId]
    );

    if (rows.length === 0) {
      conn.release();
      return res.status(404).json({ success: false, message: 'Payment record not found' });
    }

    if (rows[0].user_id !== req.user.user_id && !req.user.is_admin) {
      conn.release();
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await conn.beginTransaction();

    await conn.query(
      `UPDATE payments
       SET payment_status = ?,
           payment_method = COALESCE(?, payment_method),
           paid_at        = CASE WHEN ? = 'SUCCESS' THEN NOW() ELSE NULL END
       WHERE booking_id = ?`,
      [payment_status, payment_method || null, payment_status, bookingId]
    );

    // Sync booking status via trigger (already in SQL), but also update directly
    const bookingStatus = payment_status === 'SUCCESS' ? 'CONFIRMED' : 'CANCELLED';
    await conn.query(
      'UPDATE bookings SET booking_status = ? WHERE booking_id = ?',
      [bookingStatus, bookingId]
    );

    // If payment failed → restore seat availability
    if (payment_status === 'FAILED') {
      await conn.query(
        `UPDATE seats SET is_available = 1
         WHERE seat_id IN (SELECT seat_id FROM booking_seats WHERE booking_id = ?)`,
        [bookingId]
      );
    }

    await conn.commit();
    conn.release();

    res.json({
      success: true,
      message: `Payment ${payment_status === 'SUCCESS' ? 'verified' : 'marked as failed'}`,
      data:    { booking_id: Number(bookingId), payment_status, booking_status: bookingStatus },
    });
  } catch (err) {
    await conn.rollback();
    conn.release();
    next(err);
  }
};

// ──────────────────────────────────────────────
// GET /api/payments  (admin – all payments)
// ──────────────────────────────────────────────
const getAllPayments = async (req, res, next) => {
  try {
    const { status } = req.query;
    let sql = `
      SELECT p.*, u.full_name, u.email, e.title AS event_title, b.booking_status
      FROM payments p
      JOIN bookings b ON p.booking_id = b.booking_id
      JOIN users    u ON b.user_id    = u.user_id
      JOIN events   e ON b.event_id   = e.event_id
      WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ' AND p.payment_status = ?'; params.push(status); }
    sql += ' ORDER BY p.paid_at DESC';

    const [rows] = await db.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { getPaymentByBooking, verifyPayment, getAllPayments };
