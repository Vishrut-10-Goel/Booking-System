const db          = require('../config/db');
const ticketSvc   = require('../services/ticketService');
const path        = require('path');
const fs          = require('fs');

// GET /api/tickets/:bookingId/download  (protected – owner only)
const downloadTicket = async (req, res, next) => {
  try {
    const { bookingId } = req.params;

    // Fetch booking + event + seats
    const [rows] = await db.query(
      `SELECT b.*, e.title, e.event_date, e.event_time,
              v.venue_name, v.city, v.address,
              u.full_name, u.email
       FROM bookings b
       JOIN events e ON b.event_id = e.event_id
       JOIN venues v ON e.venue_id = v.venue_id
       JOIN users  u ON b.user_id  = u.user_id
       WHERE b.booking_id = ?`,
      [bookingId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const booking = rows[0];
    if (booking.user_id !== req.user.user_id && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const [seats] = await db.query(
      `SELECT s.seat_id, s.row_letter, s.seat_number, s.seat_type, s.price
       FROM booking_seats bs JOIN seats s ON bs.seat_id = s.seat_id
       WHERE bs.booking_id = ?`,
      [bookingId]
    );

    const filePath = await ticketSvc.generateTicketPDF({
      booking: { booking_id: booking.booking_id, total_amount: booking.total_amount },
      user:    { full_name: booking.full_name, email: booking.email },
      event:   { title: booking.title, event_date: booking.event_date, event_time: booking.event_time, venue_name: booking.venue_name, city: booking.city },
      seats,
    });

    res.download(filePath, `eventra-ticket-${bookingId}.pdf`, (err) => {
      if (err) next(err);
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/tickets/:bookingId/qr  – returns QR as base64
const getQRCode = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const [rows] = await db.query('SELECT user_id FROM bookings WHERE booking_id = ?', [bookingId]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (rows[0].user_id !== req.user.user_id && !req.user.is_admin) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const qr = await ticketSvc.generateQRCode(bookingId);
    res.json({ success: true, data: { booking_id: Number(bookingId), qr_base64: qr } });
  } catch (err) {
    next(err);
  }
};

module.exports = { downloadTicket, getQRCode };
