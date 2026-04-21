const helmet        = require('helmet');
const rateLimit     = require('express-rate-limit');

/**
 * Helmet – sets secure HTTP headers.
 * CSP is configured to allow:
 *   • inline <style> and <script> blocks (index.html is monolithic)
 *   • inline onclick="..." event handler attributes (scriptSrcAttr)
 *   • Google Fonts (fonts.googleapis.com / fonts.gstatic.com)
 *   • data: URIs (favicon is inline SVG data URI)
 * All other default protections (HSTS, X-Frame-Options, etc.) remain on.
 */
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'", "'unsafe-inline'"],
      scriptSrcAttr:  ["'unsafe-inline'"],  // allows onclick="..." attributes on buttons
      styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:        ["'self'", "https://fonts.gstatic.com"],
      imgSrc:         ["'self'", "data:", "https:"],
      connectSrc:     ["'self'"],
      frameSrc:       ["'none'"],
      objectSrc:      ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
});

/**
 * General API rate limiter – 100 requests per 15 minutes per IP
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests – please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts – please try again in 15 minutes' },
});

module.exports = { helmetMiddleware, apiLimiter, authLimiter };
