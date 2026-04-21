/* EVENTRA – Ticket Service (graceful no-op if pdfkit unavailable) */
'use strict';
const path = require('path');
const fs   = require('fs');
const TICKET_DIR = path.join(__dirname, '../tmp/tickets');
if (!fs.existsSync(TICKET_DIR)) fs.mkdirSync(TICKET_DIR, { recursive: true });

async function generateTicketPDF({ booking, user, event, seats = [] }) {
  try {
    const PDFDoc = require('pdfkit');
    const QRCode = require('qrcode');
    const filePath = path.join(TICKET_DIR, `ticket_${booking.booking_id}.pdf`);
    const doc = new PDFDoc({ size: 'A5', margin: 40 });
    doc.pipe(fs.createWriteStream(filePath));
    doc.fontSize(22).fillColor('#d4a843').text('EVENTRA', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).fillColor('#000').text(event.title || 'Event', { align: 'center' });
    doc.fontSize(12).text(`Booking #${booking.booking_id}  |  ₹${booking.total_amount}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text(`Customer: ${user.full_name}`);
    doc.text(`Seats: ${seats.map(s => `${s.row_letter}${s.seat_number}`).join(', ')}`);
    try {
      const qr = await QRCode.toDataURL(String(booking.booking_id));
      const buf = Buffer.from(qr.replace(/^data:image\/png;base64,/,''), 'base64');
      doc.moveDown().image(buf, { fit:[100,100], align:'center' });
    } catch(_) {}
    doc.end();
    return filePath;
  } catch(e) {
    console.error('[Ticket] PDF generation failed (non-fatal):', e.message);
    return null;
  }
}

module.exports = { generateTicketPDF };
