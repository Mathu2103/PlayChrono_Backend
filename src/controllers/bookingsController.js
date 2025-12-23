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

// Utility: Generate Time Slots
const generateSlots = (startHour, endHour) => {
    const slots = [];
    for (let i = startHour; i < endHour; i += 2) {
        // e.g., "06:00 - 08:00"
        const start = String(i).padStart(2, '0') + ':00';
        const end = String(i + 2).padStart(2, '0') + ':00';
        slots.push(`${start} - ${end}`);
    }
    return slots;
};

// Sport-Specific Ground Configuration
// Sport-Specific Ground Configuration
const getGroundsForSport = (sport) => {
    const s = sport.toLowerCase().trim();

    // Group 1: Football, Cricket, Elle, Track Meets -> 2 Grounds, 06:00 - 22:00
    if (['football', 'cricket', 'elle', 'track meets', 'track'].includes(s)) {
        const slots = generateSlots(6, 22);
        return [
            { groundId: 'arena_main', groundName: 'Main Arena', slots: slots },
            { groundId: 'arena_north', groundName: 'North Arena', slots: slots }
        ];
    }

    // Group 2: Badminton -> 2 Grounds, 06:00 - 20:00
    if (s === 'badminton') {
        const slots = generateSlots(6, 20);
        return [
            { groundId: 'court_shuttler_1', groundName: 'Shuttler’s Court 1', slots: slots },
            { groundId: 'court_shuttler_2', groundName: 'Shuttler’s Court 2', slots: slots }
        ];
    }

    // Group 3: Table Tennis -> 2 Halls, 06:00 - 20:00
    if (s === 'table tennis' || s === 'tabletennis') {
        const slots = generateSlots(6, 20);
        return [
            { groundId: 'hall_pp_a', groundName: 'Ping Pong Hall A', slots: slots },
            { groundId: 'hall_pp_b', groundName: 'Ping Pong Hall B', slots: slots }
        ];
    }

    // Group 4: Volleyball -> 1 Ground, 06:00 - 22:00
    if (s === 'volleyball') {
        const slots = generateSlots(6, 22);
        return [
            { groundId: 'court_spike', groundName: 'Spike Court', slots: slots }
        ];
    }

    // Default: Return empty or generic if unknown sport
    return [];
};

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

        // Get Grounds CONFIG based on sport
        const targetGrounds = getGroundsForSport(sport);

        if (targetGrounds.length === 0) {
            return res.status(404).json({ success: false, error: "No grounds found for this sport" });
        }

        // Check DB for existing bookings for this date
        const bookingsRef = db.collection('bookings');
        const snapshot = await bookingsRef
            .where('date', '==', validDate)
            .where('status', '==', 'confirmed')
            .get();

        // Map booked slots by ground
        const bookedSlotsByGround = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.groundId && data.selectedSlots && Array.isArray(data.selectedSlots)) {
                if (!bookedSlotsByGround[data.groundId]) bookedSlotsByGround[data.groundId] = [];
                bookedSlotsByGround[data.groundId].push(...data.selectedSlots);
            }
        });

        // Construct Response using DYNAMIC grounds
        const responseGrounds = targetGrounds.map(ground => {
            const booked = bookedSlotsByGround[ground.groundId] || [];

            const processedSlots = ground.slots.map((time) => ({
                id: `${ground.groundId}_${time.replace(/[:\s]/g, '')}`, // Robust ID
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

        return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};

// 2. Create Booking
exports.createBooking = async (req, res) => {
    try {
        const { captainId, captainName, teamName, sportType, groundId, groundName, date, selectedSlots, purpose } = req.body;

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
                teamName: teamName || 'Unknown Team',
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

// 4. Get Today's Bookings (For Notices)
exports.getTodayBookings = async (req, res) => {
    try {
        // Get today's date in YYYY-MM-DD
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const validDate = `${year}-${month}-${day}`;

        console.log(`Fetching bookings for Today: ${validDate}`);

        const bookingsRef = db.collection('bookings');
        const snapshot = await bookingsRef
            .where('date', '==', validDate)
            .where('status', '==', 'confirmed')
            .get();

        if (snapshot.empty) {
            return res.status(200).json({ success: true, bookings: [] });
        }

        const bookings = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            // Transform data for the simplified Notices view
            bookings.push({
                bookingId: data.bookingId,
                groundName: data.groundName,
                timeSlots: data.selectedSlots.join(', '),
                purpose: data.purpose,
                captainName: data.captainName,
                captainName: data.captainName,
                teamName: data.teamName || data.captainName // Use teamName if available, else fallback
            });
        });

        return res.status(200).json({ success: true, bookings });

    } catch (error) {
        console.error("Error in getTodayBookings:", error);
        return res.status(500).json({ success: false, error: "Failed to fetch notices" });
    }
};

// 5. Get All Bookings (Admin)
exports.getAllBookings = async (req, res) => {
    try {
        const bookingsRef = db.collection('bookings');

        // 1. Get Today's Date String
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;

        // 2. Fetch bookings from today onwards
        const snapshot = await bookingsRef
            .where('date', '>=', todayStr)
            .orderBy('date', 'asc')
            .get();

        if (snapshot.empty) {
            return res.status(200).json({ success: true, bookings: [] });
        }

        const validBookings = [];
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();
        const currentTimeVal = currentHour * 60 + currentMin; // Minutes from midnight

        snapshot.forEach(doc => {
            const data = doc.data();

            if (!data.date) return;

            // Strict Future Dates -> VALID
            if (data.date > todayStr) {
                validBookings.push(data);
            }
            // Today's Dates -> Check Time
            else if (data.date === todayStr) {
                const slots = data.selectedSlots || [];
                let maxEndMinutes = 0;

                // Parse slots to find when the booking finishes
                slots.forEach(slot => {
                    // slot: "06:00 - 08:00"
                    const parts = slot.split(' - ');
                    if (parts.length === 2) {
                        const endTime = parts[1]; // "08:00"
                        const [endH, endM] = endTime.split(':').map(Number);
                        const endTotalMinutes = endH * 60 + endM;
                        if (endTotalMinutes > maxEndMinutes) {
                            maxEndMinutes = endTotalMinutes;
                        }
                    }
                });

                // If currently BEFORE the end time, it is Active
                if (currentTimeVal < maxEndMinutes) {
                    validBookings.push(data);
                }
            }
        });

        return res.status(200).json({ success: true, bookings: validBookings });

    } catch (error) {
        console.error("Error in getAllBookings:", error);

        // Fallback catch-all for potential index errors or other issues
        try {
            // Simplified fallback: Fetch all active/future without complex filtering if index fails
            const todayStr = new Date().toISOString().split('T')[0];
            const bookingsRef = db.collection('bookings');
            const snapshot = await bookingsRef.where('date', '>=', todayStr).get();

            const bookings = [];
            snapshot.forEach(doc => { bookings.push(doc.data()) });

            // Just return date-filtered list to be safe if time-logic fails in fallback
            bookings.sort((a, b) => new Date(a.date) - new Date(b.date));
            return res.status(200).json({ success: true, bookings });
        } catch (err) {
            return res.status(500).json({ success: false, error: "Failed to fetch bookings" });
        }
    }
};

// 6. Delete Booking (Admin)
exports.deleteBooking = async (req, res) => {
    try {
        const { bookingId } = req.params;

        if (!bookingId) {
            return res.status(400).json({ success: false, error: "Booking ID is required" });
        }

        await db.collection('bookings').doc(bookingId).delete();

        return res.status(200).json({ success: true, message: "Booking deleted successfully" });
    } catch (error) {
        console.error("Error in deleteBooking:", error);
        return res.status(500).json({ success: false, error: "Failed to delete booking" });
    }
};
