const express = require('express');
const router  = express.Router();
const { downloadTicket, getQRCode } = require('../controllers/ticketController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/:bookingId/download', downloadTicket);
router.get('/:bookingId/qr',       getQRCode);

module.exports = router;
