const db = require('../config/db');
const { validationResult } = require('express-validator');

// ──────────────────────────────────────────────
// GET /api/events
// Query params: category_id, city, date_from, date_to, search
// ──────────────────────────────────────────────
const getAllEvents = async (req, res, next) => {
  try {
    const { category_id, city, date_from, date_to, search } = req.query;

    let sql = `
      SELECT
        e.event_id, e.title, e.description, e.event_date, e.event_time,
        e.base_price, e.avg_rating,
        v.venue_name, v.city, v.state, v.capacity,
        c.category_name,
        COUNT(s.seat_id)                                      AS total_seats,
        SUM(CASE WHEN s.is_available = 1 THEN 1 ELSE 0 END)  AS available_seats
      FROM events e
      JOIN venues     v ON e.venue_id    = v.venue_id
      JOIN categories c ON e.category_id = c.category_id
      LEFT JOIN seats s ON e.event_id    = s.event_id
      WHERE 1=1
    `;
    const params = [];

    if (category_id) { sql += ' AND e.category_id = ?'; params.push(category_id); }
    if (city)        { sql += ' AND v.city = ?';         params.push(city); }
    if (date_from)   { sql += ' AND e.event_date >= ?';  params.push(date_from); }
    if (date_to)     { sql += ' AND e.event_date <= ?';  params.push(date_to); }
    if (search)      { sql += ' AND e.title LIKE ?';     params.push(`%${search}%`); }

    sql += ' GROUP BY e.event_id ORDER BY e.event_date ASC';

    const [rows] = await db.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// GET /api/events/:id
// ──────────────────────────────────────────────
const getEventById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [events] = await db.query(
      `SELECT
         e.*,
         v.venue_name, v.city, v.state, v.capacity, v.address,
         c.category_name, c.description AS category_description
       FROM events e
       JOIN venues     v ON e.venue_id    = v.venue_id
       JOIN categories c ON e.category_id = c.category_id
       WHERE e.event_id = ?`,
      [id]
    );

    if (events.length === 0) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    // Attach seat summary
    const [seatSummary] = await db.query(
      `SELECT seat_type,
              COUNT(*) AS total,
              SUM(CASE WHEN is_available=1 THEN 1 ELSE 0 END) AS available,
              price
       FROM seats WHERE event_id = ? GROUP BY seat_type, price`,
      [id]
    );

    res.json({ success: true, data: { ...events[0], seat_summary: seatSummary } });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// POST /api/events  (admin)
// ──────────────────────────────────────────────
const createEvent = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { title, description, event_date, event_time, venue_id, category_id, base_price } = req.body;

    const [result] = await db.query(
      `INSERT INTO events (title, description, event_date, event_time, venue_id, category_id, base_price)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title, description, event_date, event_time, venue_id, category_id, base_price]
    );

    res.status(201).json({
      success: true,
      message: 'Event created',
      data: { event_id: result.insertId, title },
    });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// PUT /api/events/:id  (admin)
// ──────────────────────────────────────────────
const updateEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const fields = ['title','description','event_date','event_time','venue_id','category_id','base_price'];
    const updates = [];
    const params  = [];

    fields.forEach(f => {
      if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
    });

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    params.push(id);
    await db.query(`UPDATE events SET ${updates.join(', ')} WHERE event_id = ?`, params);

    res.json({ success: true, message: 'Event updated' });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// GET /api/events/categories
// ──────────────────────────────────────────────
const getCategories = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM categories ORDER BY category_name');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// GET /api/events/venues
// ──────────────────────────────────────────────
const getVenues = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM venues ORDER BY venue_name');
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAllEvents, getEventById, createEvent, updateEvent, getCategories, getVenues };

// ──────────────────────────────────────────────
// DELETE /api/events/:id  (admin)
// ──────────────────────────────────────────────
const deleteEvent = async (req, res, next) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await db.getConnection();
    const [existing] = await conn.query('SELECT event_id FROM events WHERE event_id = ?', [id]);
    if (existing.length === 0) {
      conn.release();
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    
    await conn.beginTransaction();

    // 1. Delete reviews
    await conn.query('DELETE FROM reviews WHERE event_id = ?', [id]);

    // 2. Get bookings to delete dependent records
    const [bookings] = await conn.query('SELECT booking_id FROM bookings WHERE event_id = ?', [id]);
    const bookingIds = bookings.map(b => b.booking_id);

    if (bookingIds.length > 0) {
      const placeholders = bookingIds.map(() => '?').join(',');
      // 3. Delete payments
      await conn.query(`DELETE FROM payments WHERE booking_id IN (${placeholders})`, bookingIds);
      // 4. Delete booking_food
      await conn.query(`DELETE FROM booking_food WHERE booking_id IN (${placeholders})`, bookingIds);
      // 5. Delete booking_seats
      await conn.query(`DELETE FROM booking_seats WHERE booking_id IN (${placeholders})`, bookingIds);
    }

    // 6. Delete bookings
    await conn.query('DELETE FROM bookings WHERE event_id = ?', [id]);
    
    // 7. Delete seats
    await conn.query('DELETE FROM seats WHERE event_id = ?', [id]);
    
    // 8. Delete the event itself
    await conn.query('DELETE FROM events WHERE event_id = ?', [id]);

    await conn.commit();
    conn.release();
    
    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (err) {
    if (conn) {
      await conn.rollback();
      conn.release();
    }
    next(err);
  }
};

Object.assign(module.exports, { deleteEvent });
