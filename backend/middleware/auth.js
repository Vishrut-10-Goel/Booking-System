const jwt = require('jsonwebtoken');

/**
 * Protect routes – validates Bearer JWT token.
 */
const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized – no token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { user_id, email, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Unauthorized – invalid or expired token' });
  }
};

/**
 * Admin-only middleware (placeholder – extend when admin role added to users table).
 * For now a static admin flag can be stored in JWT payload.
 */
const adminOnly = (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ success: false, message: 'Forbidden – admin access required' });
  }
  next();
};

module.exports = { protect, adminOnly };
