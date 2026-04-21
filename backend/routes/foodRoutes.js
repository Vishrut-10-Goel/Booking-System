const express = require('express');
const router  = express.Router();
const { getAllFood, createFoodItem } = require('../controllers/foodController');
const { protect, adminOnly }        = require('../middleware/auth');

router.get('/',  getAllFood);
router.post('/', protect, adminOnly, createFoodItem);

module.exports = router;
