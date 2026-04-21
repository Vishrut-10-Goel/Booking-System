const db = require('../config/db');

// GET /api/food
const getAllFood = async (req, res, next) => {
  try {
    const { veg_only } = req.query;
    let sql = 'SELECT * FROM food_items';
    const params = [];

    if (veg_only === 'true') { sql += ' WHERE is_veg = 1'; }
    sql += ' ORDER BY food_name';

    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// POST /api/food  (admin)
const createFoodItem = async (req, res, next) => {
  try {
    const { food_name, price, is_veg } = req.body;
    if (!food_name || price === undefined) {
      return res.status(400).json({ success: false, message: 'food_name and price are required' });
    }

    const [result] = await db.query(
      'INSERT INTO food_items (food_name, price, is_veg) VALUES (?, ?, ?)',
      [food_name, price, is_veg !== undefined ? is_veg : 1]
    );
    res.status(201).json({ success: true, data: { food_id: result.insertId, food_name, price } });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAllFood, createFoodItem };
