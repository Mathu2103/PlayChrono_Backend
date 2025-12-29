const { db } = require('../config/firebase');

exports.getCaptains = async (req, res) => {
    try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('role', '==', 'captain').get();

        if (snapshot.empty) {
            return res.status(200).json({ success: true, captains: [] });
        }

        const captains = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            captains.push({
                id: doc.id,
                username: data.username || data.name || 'Unknown',
                email: data.email,
                role: data.role,
                sport: data.sport,
                teamName: data.teamName
            });
        });

        return res.status(200).json({ success: true, captains });
    } catch (error) {
        console.error("Error fetching captains:", error);
        return res.status(500).json({ success: false, error: "Failed to fetch captains" });
    }
};

exports.checkEmail = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).limit(1).get();

        if (snapshot.empty) {
            return res.status(404).json({ exists: false, message: 'Email not found' });
        }

        return res.status(200).json({ exists: true, message: 'Email exists' });

    } catch (error) {
        console.error("Error checking email:", error);
        return res.status(500).json({ error: "Failed to check email" });
    }
};
