const { db } = require('../config/firebase');

// Utility: Normalize Date to YYYY-MM-DD
const normalizeDate = (dateStr) => {
    try {
        if (!dateStr) return null;
        // Keep as string if already YYYY-MM-DD, or format if Date object
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        return d.toISOString().split('T')[0];
    } catch {
        return null;
    }
};

// Ground Definitions (Static logic for robustness)
const GROUNDS = [
    {
        groundId: 'g1',
        groundName: 'Central Ground',
        slots: ['08:00 - 10:00', '10:00 - 12:00', '14:00 - 16:00', '16:00 - 18:00', '18:00 - 20:00']
    },
    {
        groundId: 'g2',
        groundName: 'North Arena',
        slots: ['08:00 - 10:00', '10:00 - 12:00', '14:00 - 16:00']
    }
];

// 1. Get Available Slots
exports.getAvailableSlots = async (req, res) => {
    try {
        const { sport, date } = req.query;

        // Validation
        if (!sport || !date) {
            return res.status(400).json({ success: false, error: "Missing required query parameters: sport, date" });
        }

        const validDate = normalizeDate(date);
        if (!validDate) {
            return res.status(400).json({ success: false, error: "Invalid date format. Use YYYY-MM-DD" });
        }

        const normalizedSport = sport.toLowerCase();

        // Check DB for existing bookings for this date
        // Note: In a real app, you might filter by sport/ground specific logic.
        const bookingsRef = db.collection('bookings');
        const snapshot = await bookingsRef
            .where('date', '==', validDate)
            .where('status', '==', 'confirmed') // Only confirmed bookings block slots
            .get();

        // Map booked slots by ground
        const bookedSlotsByGround = {}; // { g1: ['10:00 - 12:00'], g2: [] }

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.groundId && data.selectedSlots && Array.isArray(data.selectedSlots)) {
                if (!bookedSlotsByGround[data.groundId]) bookedSlotsByGround[data.groundId] = [];
                bookedSlotsByGround[data.groundId].push(...data.selectedSlots);
            }
        });

        // Construct Response
        const responseGrounds = GROUNDS.map(ground => {
            const booked = bookedSlotsByGround[ground.groundId] || [];

            const processedSlots = ground.slots.map((time, index) => ({
                id: `s${index}_${ground.groundId}`, // Unique Slot ID
                time: time,
                status: booked.includes(time) ? 'booked' : 'available'
            }));

            // Calculate availability count
            const availableCount = processedSlots.filter(s => s.status === 'available').length;

            return {
                groundId: ground.groundId,
                groundName: ground.groundName,
                totalSlots: ground.slots.length,
                availableCount: availableCount,
                slots: processedSlots
            };
        });

        return res.status(200).json({ success: true, grounds: responseGrounds });

    } catch (error) {
        console.error("Error in getAvailableSlots:", error);
        // Force JSON response even on crash
        return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};

// 2. Create Booking
exports.createBooking = async (req, res) => {
    try {
        const { captainId, captainName, sportType, groundId, groundName, date, selectedSlots, purpose } = req.body;

        // Validation
        if (!captainId || !groundId || !date || !selectedSlots || !Array.isArray(selectedSlots) || selectedSlots.length === 0) {
            return res.status(400).json({ success: false, error: "Missing required fields or invalid slots" });
        }

        const validDate = normalizeDate(date);
        if (!validDate) {
            return res.status(400).json({ success: false, error: "Invalid date format" });
        }

        // Transaction for Atomicity (Prevent Double Booking)
        await db.runTransaction(async (transaction) => {
            // Check if slots are taken
            const bookingsRef = db.collection('bookings');
            const querySnapshot = await bookingsRef
                .where('date', '==', validDate)
                .where('groundId', '==', groundId)
                .where('status', '==', 'confirmed')
                .get();

            let isConflict = false;
            querySnapshot.forEach(doc => {
                const existingSlots = doc.data().selectedSlots || [];
                // Check intersection
                const overlap = existingSlots.some(slot => selectedSlots.includes(slot));
                if (overlap) isConflict = true;
            });

            if (isConflict) {
                throw new Error("One or more selected slots are already booked.");
            }

            // Create Booking Document
            const newBookingRef = bookingsRef.doc();
            const bookingData = {
                bookingId: newBookingRef.id,
                captainId,
                captainName: captainName || 'Unknown Captain',
                sportType: sportType || 'Sports',
                groundId,
                groundName: groundName || 'Unknown Ground',
                date: validDate,
                selectedSlots, // Array of strings e.g. ["08:00 - 10:00"]
                purpose: purpose || 'General',
                status: 'confirmed', // Assuming auto-confirm for now
                createdAt: new Date().toISOString()
            };

            transaction.set(newBookingRef, bookingData);
        });

        return res.status(201).json({ success: true, message: "Booking confirmed successfully" });

    } catch (error) {
        console.error("Error in createBooking:", error);
        if (error.message.includes("already booked")) {
            return res.status(409).json({ success: false, error: "Selected slots are no longer available" });
        }
        return res.status(500).json({ success: false, error: "Failed to create booking" });
    }
};

// 3. Get Captain's Bookings
exports.getCaptainBookings = async (req, res) => {
    try {
        const { captainId } = req.params;

        if (!captainId) {
            return res.status(400).json({ success: false, error: "Captain ID is required" });
        }

        const bookingsRef = db.collection('bookings');
        // Note: .orderBy() might fail if index is missing. We try-catch specific error or omit orderBy for MVP safety.
        // We will TRY orderBy, but fallback if it fails.

        let snapshot;
        try {
            snapshot = await bookingsRef
                .where('captainId', '==', captainId)
                .orderBy('date', 'desc')
                .get();
        } catch (idxError) {
            if (idxError.code === 9) { // FAILED_PRECONDITION (Index required)
                console.warn("Firestore Index Missing. Fetching unordered list.");
                snapshot = await bookingsRef.where('captainId', '==', captainId).get();
            } else {
                throw idxError;
            }
        }

        if (snapshot.empty) {
            return res.status(200).json({ success: true, bookings: [] });
        }

        const bookings = [];
        snapshot.forEach(doc => {
            bookings.push(doc.data());
        });

        // Client-side sort if Index failed (optional, but nice)
        // bookings.sort((a, b) => new Date(b.date) - new Date(a.date));

        return res.status(200).json({ success: true, bookings });

    } catch (error) {
        console.error("Error in getCaptainBookings:", error);
        return res.status(500).json({ success: false, error: "Failed to fetch bookings" });
    }
};
