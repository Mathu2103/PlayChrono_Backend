const express = require('express');
const { getAvailableSlots, createBooking, getCaptainBookings } = require('../controllers/bookingsController');

console.log('Booking Controller Imports Check:');
console.log('getAvailableSlots:', typeof getAvailableSlots);
console.log('createBooking:', typeof createBooking);
console.log('getCaptainBookings:', typeof getCaptainBookings);

const router = express.Router();

// Fetch available slots for a sport/date
router.get('/available', getAvailableSlots);

// Create a new booking
router.post('/', createBooking);

// Get specific captain's booking history
router.get('/my-bookings/:captainId', getCaptainBookings);

module.exports = router;
