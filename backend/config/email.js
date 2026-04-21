const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,   // Gmail App Password
  },
});

// Verify connection on startup (non-fatal – app still runs without email)
transporter.verify((err) => {
  if (err) console.warn('⚠️  Email service not configured:', err.message);
  else     console.log('✅ Email service ready');
});

module.exports = transporter;
