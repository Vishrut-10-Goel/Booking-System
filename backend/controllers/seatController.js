const db = require('../config/db');
const { validationResult } = require('express-validator');

// ──────────────────────────────────────────────
// GET /api/events/:eventId/seats
// Returns seat map grouped by row
// ──────────────────────────────────────────────
const getSeatMap = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    // Verify event exists
    const [ev] = await db.query('SELECT event_id, title FROM events WHERE event_id = ?', [eventId]);
    if (ev.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const [seats] = await db.query(
      `SELECT seat_id, row_letter, seat_number, seat_type, is_available, price
       FROM seats WHERE event_id = ? ORDER BY row_letter, seat_number`,
      [eventId]
    );

    // Group by row for frontend seat map rendering
    const seatMap = {};
    seats.forEach(seat => {
      if (!seatMap[seat.row_letter]) seatMap[seat.row_letter] = [];
      seatMap[seat.row_letter].push(seat);
    });

    res.json({
      success: true,
      data: {
        event_id:  Number(eventId),
        event_title: ev[0].title,
        rows: seatMap,
        summary: {
          total:     seats.length,
          available: seats.filter(s => s.is_available).length,
          booked:    seats.filter(s => !s.is_available).length,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// POST /api/events/:eventId/seats/generate  (admin)
// Calls stored procedure: generate_seat_map
// ──────────────────────────────────────────────
const generateSeats = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { eventId } = req.params;
    const { rows, seats_per_row, vip_rows, premium_rows, vip_price, premium_price, regular_price } = req.body;

    // Call the stored procedure defined in SQL
    await db.query('CALL generate_seat_map(?, ?, ?, ?, ?, ?, ?, ?)', [
      eventId,
      rows            || 5,
      seats_per_row   || 10,
      vip_rows        || 1,
      premium_rows    || 1,
      vip_price       || 1200,
      premium_price   || 800,
      regular_price   || 500,
    ]);

    res.status(201).json({ success: true, message: 'Seat map generated successfully' });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// GET /api/seats/:seatId
// Single seat detail
// ──────────────────────────────────────────────
const getSeatById = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*, e.title AS event_title
       FROM seats s JOIN events e ON s.event_id = e.event_id
       WHERE s.seat_id = ?`,
      [req.params.seatId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Seat not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSeatMap, generateSeats, getSeatById };
