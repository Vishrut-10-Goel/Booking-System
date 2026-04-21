const cron        = require('node-cron');
const db          = require('../config/db');
const emailSvc    = require('../services/emailService');

/**
 * Job 1: Every hour – send 24-hour event reminders
 */
cron.schedule('0 * * * *', async () => {
  console.log('[Cron] Running event reminder job...');
  try {
    const [bookings] = await db.query(`
      SELECT
        b.booking_id, b.total_amount,
        u.user_id, u.full_name, u.email,
        e.event_id, e.title, e.event_date, e.event_time,
        v.venue_name, v.city,
        GROUP_CONCAT(CONCAT(s.row_letter, s.seat_number) SEPARATOR ', ') AS seat_labels
      FROM bookings b
      JOIN users   u  ON b.user_id   = u.user_id
      JOIN events  e  ON b.event_id  = e.event_id
      JOIN venues  v  ON e.venue_id  = v.venue_id
      JOIN booking_seats bs ON b.booking_id = bs.booking_id
      JOIN seats   s  ON bs.seat_id  = s.seat_id
      WHERE b.booking_status = 'CONFIRMED'
        AND DATE(e.event_date) = DATE(NOW() + INTERVAL 1 DAY)
        AND (b.reminder_sent IS NULL OR b.reminder_sent = 0)
      GROUP BY b.booking_id
    `);

    for (const row of bookings) {
      try {
        await emailSvc.sendEventReminder({
          user:  { full_name: row.full_name, email: row.email },
          event: { title: row.title, event_date: row.event_date, event_time: row.event_time, venue_name: row.venue_name, city: row.city },
          seats: row.seat_labels.split(', ').map(s => ({ row_letter: s[0], seat_number: s.slice(1) })),
        });
        await db.query('UPDATE bookings SET reminder_sent = 1 WHERE booking_id = ?', [row.booking_id]);
        console.log(`[Cron] Reminder sent → booking #${row.booking_id}`);
      } catch (err) {
        console.error(`[Cron] Reminder failed for booking #${row.booking_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Cron] Reminder job error:', err.message);
  }
});

/**
 * Job 2: Daily at 10 AM – send review request emails for events that ended yesterday
 */
cron.schedule('0 10 * * *', async () => {
  console.log('[Cron] Running review request job...');
  try {
    const [bookings] = await db.query(`
      SELECT
        b.booking_id, b.total_amount,
        u.user_id, u.full_name, u.email,
        e.event_id, e.title
      FROM bookings b
      JOIN users  u ON b.user_id  = u.user_id
      JOIN events e ON b.event_id = e.event_id
      LEFT JOIN reviews r ON r.user_id = b.user_id AND r.event_id = b.event_id
      WHERE b.booking_status = 'CONFIRMED'
        AND DATE(e.event_date) = DATE(NOW() - INTERVAL 1 DAY)
        AND r.review_id IS NULL
    `);

    for (const row of bookings) {
      try {
        await emailSvc.sendReviewRequest({
          user:    { full_name: row.full_name, email: row.email },
          event:   { event_id: row.event_id, title: row.title },
          booking: { booking_id: row.booking_id },
        });
        console.log(`[Cron] Review request sent → booking #${row.booking_id}`);
      } catch (err) {
        console.error(`[Cron] Review request failed for booking #${row.booking_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Cron] Review request job error:', err.message);
  }
});

console.log('✅ Email scheduler initialized');
