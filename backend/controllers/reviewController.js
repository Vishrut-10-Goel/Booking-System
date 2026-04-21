const db = require('../config/db');
const { validationResult } = require('express-validator');

// ──────────────────────────────────────────────
// POST /api/reviews
// Body: { event_id, rating, comment }
// Only users who booked the event can review it
// ──────────────────────────────────────────────
const createReview = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { event_id, rating, comment } = req.body;
    const user_id = req.user.user_id;

    // Check if user has a confirmed booking for this event
    const [bookingCheck] = await db.query(
      `SELECT booking_id FROM bookings
       WHERE user_id = ? AND event_id = ? AND booking_status = 'CONFIRMED'
       LIMIT 1`,
      [user_id, event_id]
    );

    if (bookingCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You can only review events you have attended (confirmed booking required)',
      });
    }

    // Use the safe stored procedure for exception-handled insert
    await db.query('CALL sp_safe_review_insert(?, ?, ?, ?, @result)', [
      user_id, event_id, rating, comment || null
    ]);
    const [[{ result }]] = await db.query('SELECT @result AS result');

    if (result.startsWith('ERROR')) {
      const status = result.includes('already reviewed') ? 409 : 400;
      return res.status(status).json({ success: false, message: result.replace('ERROR: ', '') });
    }

    res.status(201).json({ success: true, message: 'Review submitted successfully' });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// GET /api/events/:eventId/reviews
// ──────────────────────────────────────────────
const getEventReviews = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const [rows] = await db.query(
      `SELECT
         r.review_id, r.rating, r.comment, r.reviewed_at,
         u.full_name AS reviewer_name
       FROM reviews r
       JOIN users u ON r.user_id = u.user_id
       WHERE r.event_id = ?
       ORDER BY r.reviewed_at DESC`,
      [eventId]
    );

    const [avgRow] = await db.query(
      'SELECT ROUND(AVG(rating),2) AS avg_rating, COUNT(*) AS total_reviews FROM reviews WHERE event_id = ?',
      [eventId]
    );

    res.json({
      success: true,
      data: {
        avg_rating:    avgRow[0].avg_rating || 0,
        total_reviews: avgRow[0].total_reviews,
        reviews:       rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// PUT /api/reviews/:reviewId   (owner only)
// ──────────────────────────────────────────────
const updateReview = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    const user_id = req.user.user_id;

    const [rows] = await db.query('SELECT * FROM reviews WHERE review_id = ?', [reviewId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (rows[0].user_id !== user_id) {
      return res.status(403).json({ success: false, message: 'Forbidden – not your review' });
    }

    await db.query(
      'UPDATE reviews SET rating = ?, comment = ? WHERE review_id = ?',
      [rating, comment, reviewId]
    );

    res.json({ success: true, message: 'Review updated' });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// DELETE /api/reviews/:reviewId  (admin or owner)
// ──────────────────────────────────────────────
const deleteReview = async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const [rows] = await db.query('SELECT * FROM reviews WHERE review_id = ?', [reviewId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    if (rows[0].user_id !== req.user.user_id && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await db.query('DELETE FROM reviews WHERE review_id = ?', [reviewId]);
    res.json({ success: true, message: 'Review deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { createReview, getEventReviews, updateReview, deleteReview };

// ──────────────────────────────────────────────
// GET /api/reviews/my   (protected)
// ──────────────────────────────────────────────
const getMyReviews = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT r.review_id, r.rating, r.comment, r.reviewed_at,
              e.event_id, e.title AS event_title, e.event_date,
              v.venue_name
       FROM reviews r
       JOIN events e ON r.event_id = e.event_id
       JOIN venues v ON e.venue_id = v.venue_id
       WHERE r.user_id = ?
       ORDER BY r.reviewed_at DESC`,
      [req.user.user_id]
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────
// GET /api/events/:eventId/reviews/distribution
// ──────────────────────────────────────────────
const getRatingDistribution = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const [rows] = await db.query(
      `SELECT rating, COUNT(*) AS count
       FROM reviews WHERE event_id = ?
       GROUP BY rating ORDER BY rating DESC`,
      [eventId]
    );

    const total = rows.reduce((s, r) => s + r.count, 0);
    const dist  = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    rows.forEach(r => {
      dist[r.rating] = {
        count:      r.count,
        percentage: total ? +((r.count / total) * 100).toFixed(1) : 0,
      };
    });

    const [[avg]] = await db.query(
      'SELECT ROUND(AVG(rating),2) AS avg_rating, COUNT(*) AS total FROM reviews WHERE event_id = ?',
      [eventId]
    );

    res.json({
      success: true,
      data: { avg_rating: avg.avg_rating || 0, total_reviews: avg.total, distribution: dist },
    });
  } catch (err) {
    next(err);
  }
};

Object.assign(module.exports, { getMyReviews, getRatingDistribution });

// ──────────────────────────────────────────────
// GET /api/reviews/check?event_id=X
// Check if logged-in user has already reviewed an event
// Used by frontend to hide review form after submission
// ──────────────────────────────────────────────
const checkReview = async (req, res, next) => {
  try {
    const { event_id } = req.query;
    if (!event_id) {
      return res.status(400).json({ success: false, message: 'event_id query param required' });
    }
    const [rows] = await db.query(
      'SELECT review_id, rating, comment FROM reviews WHERE user_id = ? AND event_id = ? LIMIT 1',
      [req.user.user_id, event_id]
    );
    res.json({
      success: true,
      data: {
        has_reviewed: rows.length > 0,
        review: rows[0] || null,
      },
    });
  } catch (err) {
    next(err);
  }
};

Object.assign(module.exports, { checkReview });
