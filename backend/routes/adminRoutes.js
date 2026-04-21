const express = require('express');
const router  = express.Router();
const {
  getDashboardStats, getBookingReport, getAllUsers,
  sendTestEmail, sendBulkEmail,
} = require('../controllers/adminController');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect, adminOnly);

router.get('/analytics',           getDashboardStats);
router.get('/bookings/report',     getBookingReport);
router.get('/users',               getAllUsers);
router.post('/email/test',         sendTestEmail);
router.post('/email/send-bulk',    sendBulkEmail);

module.exports = router;
