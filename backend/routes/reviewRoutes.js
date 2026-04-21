const express  = require('express');
const router   = express.Router();
const { body } = require('express-validator');
const {
  createReview, updateReview, deleteReview,
  getMyReviews, getRatingDistribution, checkReview,
} = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');

// ── GET /api/reviews/my     – must come before /:reviewId
router.get('/my',    protect, getMyReviews);

// ── GET /api/reviews/check?event_id=X
router.get('/check', protect, checkReview);

// ── POST /api/reviews
router.post(
  '/',
  protect,
  [
    body('event_id').isInt({ min: 1 }).withMessage('event_id is required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1–5'),
  ],
  createReview
);

// ── PUT /api/reviews/:reviewId
router.put(
  '/:reviewId',
  protect,
  [body('rating').isInt({ min: 1, max: 5 })],
  updateReview
);

// ── DELETE /api/reviews/:reviewId
router.delete('/:reviewId', protect, deleteReview);

module.exports = router;
