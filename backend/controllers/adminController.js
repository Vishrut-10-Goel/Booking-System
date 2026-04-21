const db = require('../config/db');
const emailSvc = require('../services/emailService');

// ──────────────────────────────────────────────
// GET /api/admin/analytics
// ──────────────────────────────────────────────
const getDashboardStats = async (req, res, next) => {
  try {
    const [[totalUsers]]    = await db.query('SELECT COUNT(*) AS count FROM users');
    const [[totalEvents]]   = await db.query('SELECT COUNT(*) AS count FROM events');
    const [[totalBookings]] = await db.query('SELECT COUNT(*) AS count FROM bookings WHERE booking_status = "CONFIRMED"');
    const [[totalRevenue]]  = await db.query(
      'SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE payment_status = "SUCCESS"'
    );

    const [revenueByEvent] = await db.query(
      `SELECT e.title, SUM(b.total_amount) AS revenue, COUNT(b.booking_id) AS bookings
       FROM bookings b JOIN events e ON b.event_id = e.event_id
       WHERE b.booking_status = 'CONFIRMED'
       GROUP BY b.event_id, e.title
       ORDER BY revenue DESC`
    );

    const [topEvents] = await db.query(
      `SELECT e.event_id, e.title, e.avg_rating,
              COUNT(r.review_id) AS review_count
       FROM events e LEFT JOIN reviews r ON e.event_id = r.event_id
       GROUP BY e.event_id ORDER BY e.avg_rating DESC LIMIT 5`
    );

    const [recentBookings] = await db.query(
      `SELECT b.booking_id, u.full_name, e.title, b.total_amount, b.booking_status, b.booking_date
       FROM bookings b
       JOIN users  u ON b.user_id  = u.user_id
       JOIN events e ON b.event_id = e.event_id
       ORDER BY b.booking_date DESC LIMIT 10`
    );

    res.json({
      success: true,
      data: {
        overview: {
          total_users:    totalUsers.count,
          total_events:   totalEvents.count,
          total_bookings: totalBookings.count,
          total_revenue:  totalRevenue.total,
        },
        revenue_by_event: revenueByEvent,
        top_rated_events: topEvents,
        recent_bookings:  recentBookings,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// GET /api/admin/bookings/report
// Calls cursor-based stored procedure
// ──────────────────────────────────────────────
const getBookingReport = async (req, res, next) => {
  try {
    await db.query('CALL sp_booking_report()');
    // Note: stored procedure SELECTs a result set – with mysql2 we can capture it
    const [results] = await db.query('CALL sp_booking_report()');
    // mysql2 returns [result_sets, fields]; first result set is the data
    res.json({ success: true, data: results[0] });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// GET /api/admin/users
// ──────────────────────────────────────────────
const getAllUsers = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT u.user_id, u.full_name, u.email, u.created_at,
              COUNT(b.booking_id) AS total_bookings,
              COALESCE(SUM(b.total_amount),0) AS total_spent
       FROM users u
       LEFT JOIN bookings b ON u.user_id = b.user_id AND b.booking_status='CONFIRMED'
       GROUP BY u.user_id ORDER BY u.created_at DESC`
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDashboardStats, getBookingReport, getAllUsers };

// ──────────────────────────────────────────────
// POST /api/admin/email/test
// ──────────────────────────────────────────────
const sendTestEmail = async (req, res, next) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ success: false, message: 'to email required' });
    await emailSvc.sendWelcomeEmail({ full_name: 'Admin Test', email: to });
    res.json({ success: true, message: `Test email sent to ${to}` });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// POST /api/admin/email/send-bulk
// ──────────────────────────────────────────────
const sendBulkEmail = async (req, res, next) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ success: false, message: 'subject and message required' });
    }
    const [users] = await db.query('SELECT full_name, email FROM users');
    let sent = 0;
    for (const u of users) {
      await emailSvc.sendSafe(async () => {
        const transporter = require('../config/email');
        await transporter.sendMail({
          from:    process.env.EMAIL_FROM || 'EVENTRA <noreply@eventra.com>',
          to:      u.email,
          subject,
          html:    `<div style="font-family:Arial;max-width:600px;"><h3>${subject}</h3><p>${message}</p><p>– Team EVENTRA</p></div>`,
        });
        sent++;
      });
    }
    res.json({ success: true, message: `Bulk email sent to ${sent} users` });
  } catch (err) {
    next(err);
  }
};

// Re-export with new functions
Object.assign(module.exports, { sendTestEmail, sendBulkEmail });
