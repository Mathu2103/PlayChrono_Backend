const { db } = require('../config/firebase');

exports.createNotice = async (req, res) => {
    try {
        const { title, message, userId, userName } = req.body;

        if (!title || !message) {
            return res.status(400).json({ success: false, error: "Title and message are required" });
        }

        const noticeData = {
            title,
            message,
            createdAt: new Date().toISOString(),
            createdBy: {
                userId: userId || 'admin',
                name: userName || 'Admin',
                role: 'admin' // flexible
            },
            targetAudience: 'All', // Default for now
            priority: 'General'
        };

        const docRef = await db.collection('notices').add(noticeData);

        return res.status(201).json({ success: true, message: "Notice created", noticeId: docRef.id });
    } catch (error) {
        console.error("Error creating notice:", error);
        return res.status(500).json({ success: false, error: "Failed to create notice" });
    }
};

exports.getNotices = async (req, res) => {
    try {
        const noticesRef = db.collection('notices');
        // ordering might require index, but we try
        let snapshot;
        try {
            snapshot = await noticesRef.orderBy('createdAt', 'desc').limit(20).get();
        } catch (e) {
            console.warn("Index missing for sorting notices, fetching unsorted");
            snapshot = await noticesRef.get();
        }

        const notices = [];
        snapshot.forEach(doc => {
            notices.push({ id: doc.id, ...doc.data() });
        });

        // Client side sort fallback
        notices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return res.status(200).json({ success: true, notices });
    } catch (error) {
        console.error("Error fetching notices:", error);
        return res.status(500).json({ success: false, error: "Failed to fetch notices" });
    }
};
