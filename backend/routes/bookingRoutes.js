const express  = require('express');
const router   = express.Router();
const { body } = require('express-validator');
const {
  createBooking, getMyBookings, getBookingById,
  cancelBooking, getAllBookings, checkBooking,
} = require('../controllers/bookingController');
const { protect, adminOnly } = require('../middleware/auth');

// All booking routes are protected
router.use(protect);

// ── Check if user has booked an event (review gate)
// GET /api/bookings/check?event_id=X
router.get('/check', checkBooking);

// ── User routes
router.post(
  '/',
  [
    body('event_id').isInt({ min: 1 }).withMessage('event_id must be a positive integer'),
    body('seat_ids').isArray({ min: 1 }).withMessage('seat_ids must be a non-empty array'),
    body('seat_ids.*').isInt({ min: 1 }).withMessage('Each seat_id must be a positive integer'),
  ],
  createBooking
);

router.get('/my',           getMyBookings);
router.get('/:id',          getBookingById);
router.post('/:id/cancel',   cancelBooking);

// ── Admin route
router.get('/', adminOnly, getAllBookings);

module.exports = router;
