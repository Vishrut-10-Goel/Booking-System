/**
 * Centralized error handler – must be registered LAST in app.js.
 */
const errorHandler = (err, req, res, next) => {
  console.error('[ERROR]', err);

  // MySQL duplicate entry
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ success: false, message: 'Duplicate entry – resource already exists' });
  }

  // MySQL foreign key violation
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ success: false, message: 'Referenced resource does not exist' });
  }

  const status  = err.statusCode || 500;
  const message = err.message    || 'Internal Server Error';
  res.status(status).json({ success: false, message });
};

module.exports = errorHandler;
