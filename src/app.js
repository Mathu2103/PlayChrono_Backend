const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request Logger
app.use((req, res, next) => {
    console.log(`Incoming: ${req.method} ${req.url}`);
    next();
});

// Routes
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

const bookingRoutes = require('./routes/bookingRoutes');
console.log('Loading Booking Routes at /api/bookings');
app.use('/api/bookings', bookingRoutes);

// Test Route
app.get('/', (req, res) => {
    res.status(200).json({ message: 'PlayChrono Backend is running!' });
});

// Favicon handler
app.get('/favicon.ico', (req, res) => res.status(204).end());

// 404 Handler for undefined routes
app.use((req, res, next) => {
    res.status(404).json({ error: 'Route not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Express Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
