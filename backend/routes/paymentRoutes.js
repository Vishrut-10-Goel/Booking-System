const express = require('express');
const router  = express.Router();
const { getPaymentByBooking, verifyPayment, getAllPayments } = require('../controllers/paymentController');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect);

router.get('/booking/:bookingId',   getPaymentByBooking);
router.post('/:bookingId/verify',   verifyPayment);
router.get('/',  adminOnly,         getAllPayments);

module.exports = router;
