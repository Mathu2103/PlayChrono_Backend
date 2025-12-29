const express = require('express');
const { getCaptains, checkEmail } = require('../controllers/usersController');

const router = express.Router();

router.get('/captains', getCaptains);
router.post('/check-email', checkEmail);

module.exports = router;
