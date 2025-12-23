const { db } = require('../config/firebase');

exports.getDashboardStats = async (req, res) => {
    try {
        // 1. Total Registered Captains
        const captainsSnapshot = await db.collection('users').where('role', '==', 'captain').get();
        const captainsCount = captainsSnapshot.size;

        // 2. Total Bookings
        // Note: For very large datasets, use aggregation queries like .count() if supported by your Firestore SDK version.
        // For MVP, fetching all documents solely for count is acceptable but not scalable.
        const bookingsSnapshot = await db.collection('bookings').get();
        const totalBookingsCount = bookingsSnapshot.size;

        // 3. Today's Bookings
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const validDate = `${year}-${month}-${day}`;

        const todaySnapshot = await db.collection('bookings')
            .where('date', '==', validDate)
            .where('status', '==', 'confirmed')
            .get();
        const todayEventsCount = todaySnapshot.size;

        return res.status(200).json({
            success: true,
            stats: {
                registeredCaptains: captainsCount,
                totalBookings: totalBookingsCount,
                todayEvents: todayEventsCount
            }
        });

    } catch (error) {
        console.error("Error fetching admin stats:", error);
        return res.status(500).json({ success: false, error: "Failed to fetch stats" });
    }
};
