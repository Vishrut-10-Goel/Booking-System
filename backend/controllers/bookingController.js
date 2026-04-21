const db        = require('../config/db');
const { validationResult } = require('express-validator');
const emailSvc  = require('../services/emailService');
const ticketSvc = require('../services/ticketService');

// ─────────────────────────────────────────────────────────────────
// POST /api/bookings
// ACID transaction. Seat availability locked with FOR UPDATE.
// trg_after_booking_seat_insert fires on INSERT → sets is_available=0
// ─────────────────────────────────────────────────────────────────
const createBooking = async (req, res, next) => {
  const conn = await db.getConnection();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { conn.release(); return res.status(400).json({ success: false, errors: errors.array() }); }

    const { event_id, seat_ids, food_items, payment_method } = req.body;
    const user_id = req.user.user_id;

    await conn.beginTransaction();

    // Lock rows to prevent double-booking under concurrency
    const ph = seat_ids.map(() => '?').join(',');
    const [seats] = await conn.query(
      `SELECT seat_id, is_available, price FROM seats
       WHERE seat_id IN (${ph}) AND event_id = ? FOR UPDATE`,
      [...seat_ids, event_id]
    );

    if (seats.length !== seat_ids.length) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ success: false, message: 'One or more seat IDs are invalid for this event' });
    }
    const unavailable = seats.filter(s => !s.is_available);
    if (unavailable.length > 0) {
      await conn.rollback(); conn.release();
      return res.status(409).json({
        success: false,
        message: 'One or more seats are already booked',
        unavailable_seats: unavailable.map(s => s.seat_id),
      });
    }

    let total_amount = seats.reduce((sum, s) => sum + parseFloat(s.price), 0);

    // Validate food
    let validatedFood = [];
    if (food_items && food_items.length > 0) {
      const fids = food_items.map(f => f.food_id);
      const fph  = fids.map(() => '?').join(',');
      const [foodRows] = await conn.query(
        `SELECT food_id, price FROM food_items WHERE food_id IN (${fph})`, fids
      );
      if (foodRows.length !== fids.length) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ success: false, message: 'One or more food IDs are invalid' });
      }
      const fmap = {};
      foodRows.forEach(f => { fmap[f.food_id] = parseFloat(f.price); });
      food_items.forEach(fi => { total_amount += fmap[fi.food_id] * fi.quantity; validatedFood.push(fi); });
    }

    // Create booking
    const [br] = await conn.query(
      `INSERT INTO bookings (user_id, event_id, total_amount, booking_status) VALUES (?, ?, ?, 'PENDING')`,
      [user_id, event_id, total_amount.toFixed(2)]
    );
    const booking_id = br.insertId;

    // Insert booking_seats → trg_after_booking_seat_insert fires, sets is_available=0
    for (const seat_id of seat_ids) {
      await conn.query('INSERT INTO booking_seats (booking_id, seat_id) VALUES (?, ?)', [booking_id, seat_id]);
    }

    // Food orders
    for (const fi of validatedFood) {
      await conn.query('INSERT INTO booking_food (booking_id, food_id, quantity) VALUES (?, ?, ?)',
        [booking_id, fi.food_id, fi.quantity]);
    }

    // Payment record
    await conn.query(
      `INSERT INTO payments (booking_id, amount, payment_method, payment_status) VALUES (?, ?, ?, 'PENDING')`,
      [booking_id, total_amount.toFixed(2), payment_method || 'UPI']
    );

    // Confirm (MVP: immediate)
    await conn.query(`UPDATE bookings SET booking_status='CONFIRMED' WHERE booking_id=?`, [booking_id]);
    await conn.query(`UPDATE payments SET payment_status='SUCCESS', paid_at=NOW() WHERE booking_id=?`, [booking_id]);

    await conn.commit();
    conn.release();

    res.status(201).json({
      success: true, message: 'Booking confirmed',
      data: { booking_id, event_id, user_id, seats: seat_ids, total_amount: total_amount.toFixed(2), status: 'CONFIRMED' },
    });

    // CRITICAL: Detach background tasks entirely from the request lifecycle
    setImmediate(async () => {
      try {
        console.log(`[Booking #${booking_id}] Generating ticket & email...`);
        const [[userRow]]  = await db.query('SELECT full_name, email FROM users WHERE user_id=?', [user_id]);
        const [[eventRow]] = await db.query(
          `SELECT e.title, e.event_date, e.event_time, v.venue_name, v.city
           FROM events e JOIN venues v ON e.venue_id=v.venue_id WHERE e.event_id=?`, [event_id]);
        const [seatRows] = await db.query(
          `SELECT s.row_letter, s.seat_number, s.seat_type, s.price
           FROM booking_seats bs JOIN seats s ON bs.seat_id=s.seat_id WHERE bs.booking_id=?`, [booking_id]);
        const [foodRows] = await db.query(
          `SELECT fi.food_name, bf.quantity
           FROM booking_food bf JOIN food_items fi ON bf.food_id=fi.food_id WHERE bf.booking_id=?`, [booking_id]);
        
        const ticketPath = await ticketSvc.generateTicketPDF({
          booking: { booking_id, total_amount: total_amount.toFixed(2) },
          user: userRow, event: eventRow, seats: seatRows,
        });
        
        await emailSvc.sendSafe(emailSvc.sendBookingConfirmation, {
          user: userRow, event: eventRow,
          booking: { booking_id, total_amount: total_amount.toFixed(2) },
          seats: seatRows, food: foodRows, ticketPath,
        });
        console.log(`[Booking #${booking_id}] Email sent.`);
      } catch (e) {
        console.error(`[Booking #${booking_id}] Background Task Error:`, e.message);
      }
    });
  } catch (err) {
    if (conn) {
      await conn.rollback();
      conn.release();
    }
    next(err);
  }
};

// GET /api/bookings/my
const getMyBookings = async (req, res, next) => {
  try {
    const [bookings] = await db.query(
      `SELECT b.booking_id, b.booking_date, b.total_amount, b.booking_status,
              e.event_id, e.title AS event_title, e.event_date, e.event_time,
              v.venue_name, v.city,
              p.payment_status, p.payment_method, p.paid_at
       FROM bookings b
       JOIN events e ON b.event_id=e.event_id
       JOIN venues v ON e.venue_id=v.venue_id
       LEFT JOIN payments p ON b.booking_id=p.booking_id
       WHERE b.user_id=? ORDER BY b.booking_date DESC`,
      [req.user.user_id]
    );
    for (const b of bookings) {
      [b.seats] = await db.query(
        `SELECT s.seat_id, s.row_letter, s.seat_number, s.seat_type, s.price
         FROM booking_seats bs JOIN seats s ON bs.seat_id=s.seat_id WHERE bs.booking_id=?`, [b.booking_id]);
      [b.food] = await db.query(
        `SELECT fi.food_name, fi.price, bf.quantity, (fi.price*bf.quantity) AS subtotal
         FROM booking_food bf JOIN food_items fi ON bf.food_id=fi.food_id WHERE bf.booking_id=?`, [b.booking_id]);
    }
    res.json({ success: true, count: bookings.length, data: bookings });
  } catch (err) { next(err); }
};

// GET /api/bookings/:id
const getBookingById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT b.*, e.title AS event_title, e.event_date, e.event_time,
              v.venue_name, v.city, v.address,
              p.payment_status, p.payment_method, p.paid_at, p.amount AS paid_amount
       FROM bookings b
       JOIN events e ON b.event_id=e.event_id
       JOIN venues v ON e.venue_id=v.venue_id
       LEFT JOIN payments p ON b.booking_id=p.booking_id
       WHERE b.booking_id=?`, [id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Booking not found' });
    const booking = rows[0];
    if (booking.user_id !== req.user.user_id && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const [seats] = await db.query(
      `SELECT s.seat_id, s.row_letter, s.seat_number, s.seat_type, s.price
       FROM booking_seats bs JOIN seats s ON bs.seat_id=s.seat_id WHERE bs.booking_id=?`, [id]);
    const [food] = await db.query(
      `SELECT fi.food_id, fi.food_name, fi.price, bf.quantity, (fi.price*bf.quantity) AS subtotal
       FROM booking_food bf JOIN food_items fi ON bf.food_id=fi.food_id WHERE bf.booking_id=?`, [id]);
    res.json({ success: true, data: { ...booking, seats, food } });
  } catch (err) { next(err); }
};

// ─────────────────────────────────────────────────────────────────
// PATCH /api/bookings/:id/cancel
// DELETE from booking_seats → trg_after_booking_seat_delete fires
// and sets is_available = 1 for each seat automatically.
// No manual UPDATE seats needed.
// ─────────────────────────────────────────────────────────────────
const cancelBooking = async (req, res, next) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await db.getConnection();
    const [rows] = await conn.query('SELECT user_id, booking_status, event_id FROM bookings WHERE booking_id=?', [id]);
    
    if (rows.length === 0) { conn.release(); return res.status(404).json({ success: false, message: 'Booking not found' }); }
    const booking = rows[0];

    if (booking.user_id !== req.user.user_id && !req.user.is_admin) {
      conn.release(); return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (booking.booking_status === 'CANCELLED') {
      conn.release(); return res.status(400).json({ success: false, message: 'Already cancelled' });
    }

    // Atomic updates: triggers handles the seat release
    await conn.query('DELETE FROM booking_seats WHERE booking_id=?', [id]);
    await conn.query('DELETE FROM booking_food  WHERE booking_id=?', [id]);
    await conn.query('DELETE FROM payments       WHERE booking_id=?', [id]);
    await conn.query("UPDATE bookings SET booking_status='CANCELLED' WHERE booking_id=?", [id]);
    
    conn.release();
    conn = null;

    res.json({ success: true, message: 'Booking cancelled' });

    // Background email
    (async () => {
       try {
         const [[u]] = await db.query('SELECT full_name, email FROM users WHERE user_id=?', [booking.user_id]);
         const [[e]] = await db.query('SELECT title FROM events WHERE event_id=?', [booking.event_id]);
         if(u && e) await emailSvc.sendSafe(emailSvc.sendCancellationEmail, { user:u, event:e, booking:{booking_id:id} });
       } catch(_) {}
    })();

  } catch (err) {
    if (conn) conn.release();
    next(err);
  }
};

// GET /api/bookings (admin)
const getAllBookings = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT b.booking_id, b.booking_date, b.total_amount, b.booking_status,
              u.full_name, u.email,
              e.title AS event_title, e.event_date,
              p.payment_status, p.payment_method
       FROM bookings b
       JOIN users  u ON b.user_id=u.user_id
       JOIN events e ON b.event_id=e.event_id
       LEFT JOIN payments p ON b.booking_id=p.booking_id
       ORDER BY b.booking_date DESC`
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) { next(err); }
};

module.exports = { createBooking, getMyBookings, getBookingById, cancelBooking, getAllBookings };

// ──────────────────────────────────────────────
// GET /api/bookings/check?event_id=X
// Check if logged-in user has a confirmed booking for an event
// Used by frontend to gate the review form
// ──────────────────────────────────────────────
const checkBooking = async (req, res, next) => {
  try {
    const { event_id } = req.query;
    if (!event_id) {
      return res.status(400).json({ success: false, message: 'event_id query param required' });
    }
    const [rows] = await db.query(
      `SELECT booking_id FROM bookings
       WHERE user_id = ? AND event_id = ? AND booking_status = 'CONFIRMED'
       LIMIT 1`,
      [req.user.user_id, event_id]
    );
    res.json({ success: true, data: { has_booked: rows.length > 0 } });
  } catch (err) {
    next(err);
  }
};

Object.assign(module.exports, { checkBooking });
