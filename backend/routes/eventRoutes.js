const express  = require('express');
const router   = express.Router();
const { body } = require('express-validator');
const {
  getAllEvents, getEventById, createEvent, updateEvent, deleteEvent,
  getCategories, getVenues,
} = require('../controllers/eventController');
const { getSeatMap, generateSeats } = require('../controllers/seatController');
const { getEventReviews, getRatingDistribution } = require('../controllers/reviewController');
const { protect, adminOnly } = require('../middleware/auth');

// ── Static paths first ─────────────────────────────────────────────
router.get('/categories', getCategories);
router.get('/venues',     getVenues);

// ── Event list / create ────────────────────────────────────────────
router.get('/', getAllEvents);

router.post(
  '/',
  protect, adminOnly,
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('event_date').isDate().withMessage('Valid date required'),
    body('event_time').notEmpty().withMessage('Time is required'),
    body('venue_id').isInt().withMessage('venue_id required'),
    body('category_id').isInt().withMessage('category_id required'),
    body('base_price').isFloat({ min: 0 }).withMessage('base_price required'),
  ],
  createEvent
);

// ── Single event ───────────────────────────────────────────────────
router.get('/:id', getEventById);
router.put('/:id',    protect, adminOnly, updateEvent);
router.delete('/:id', protect, adminOnly, deleteEvent);

// ── Seats ──────────────────────────────────────────────────────────
router.get( '/:eventId/seats',           getSeatMap);
router.post('/:eventId/seats/generate',  protect, adminOnly, generateSeats);

// ── Reviews for event ─────────────────────────────────────────────
router.get('/:eventId/reviews',              getEventReviews);
router.get('/:eventId/reviews/distribution', getRatingDistribution);

module.exports = router;
