const express = require('express');
const { createNotice, getNotices } = require('../controllers/noticesController');

const router = express.Router();

router.get('/', getNotices);
router.post('/', createNotice);

module.exports = router;
