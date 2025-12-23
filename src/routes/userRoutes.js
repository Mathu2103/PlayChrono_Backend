const express = require('express');
const { getCaptains } = require('../controllers/usersController');

const router = express.Router();

router.get('/captains', getCaptains);

module.exports = router;
