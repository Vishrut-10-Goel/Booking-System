/* EVENTRA – Email Service (graceful no-op when not configured) */
'use strict';

const EMAIL_CONFIGURED = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
let transporter = null;

if (EMAIL_CONFIGURED) {
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
} else {
  console.log('📧 Email: not configured — emails skipped (set EMAIL_USER in .env to enable)');
}

const FROM = process.env.EMAIL_FROM || 'EVENTRA <noreply@eventra.com>';
const wrap = (b) => `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><div style="background:#0a0a1a;padding:20px;text-align:center"><h1 style="color:#d4a843;margin:0">EVENTRA</h1></div><div style="padding:24px">${b}</div></div>`;
const send = async (opts) => { if (transporter) await transporter.sendMail({ from: FROM, ...opts }); };
const sendSafe = async (fn, args) => { if (!EMAIL_CONFIGURED) return; try { await fn(args); } catch(e){ console.error('[Email non-fatal]', e.message); } };

async function sendWelcomeEmail({ full_name, email }) {
  await send({ to: email, subject: 'Welcome to EVENTRA!', html: wrap(`<h2>Welcome, ${full_name}!</h2><p>Your account is ready.</p>`) });
}
async function sendBookingConfirmation({ user, event, booking, seats = [] }) {
  const seatList = seats.map(s => `${s.row_letter}${s.seat_number}(${s.seat_type})`).join(', ');
  await send({ to: user.email, subject: `Booking Confirmed – ${event.title}`, html: wrap(`<h2>Booking #${booking.booking_id} Confirmed</h2><p>Seats: ${seatList}</p><p>Total: ₹${booking.total_amount}</p>`) });
}
async function sendCancellationEmail({ user, event, booking }) {
  await send({ to: user.email, subject: `Booking Cancelled – ${event.title}`, html: wrap(`<h2>Booking #${booking.booking_id} Cancelled</h2>`) });
}
async function sendEventReminder({ user, event, booking }) {
  await send({ to: user.email, subject: `Reminder: ${event.title} is tomorrow!`, html: wrap(`<h2>See you tomorrow at ${event.title}!</h2>`) });
}

module.exports = { sendSafe, sendWelcomeEmail, sendBookingConfirmation, sendCancellationEmail, sendEventReminder };
