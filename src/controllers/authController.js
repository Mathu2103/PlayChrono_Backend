const { auth, db } = require('../config/firebase');

const register = async (req, res) => {
    try {
        const { email, password, username, role, sportType, teamName } = req.body;

        // Basic Validation
        if (!email || !password || !username || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // specific validation based on role if needed
        if (role === 'captain' && (!sportType || !teamName)) {
            return res.status(400).json({ error: 'Captains must provide sportType and teamName' });
        }

        // 1. Create user in Firebase Auth
        const userRecord = await auth.createUser({
            email,
            password,
            displayName: username,
        });

        // 2. Store additional user data in Firestore
        const userData = {
            uid: userRecord.uid,
            email,
            username,
            role,
            createdAt: new Date().toISOString(),
        };

        if (role === 'captain') {
            userData.sportType = sportType;
            userData.teamName = teamName;
        }

        await db.collection('users').doc(userRecord.uid).set(userData);

        res.status(201).json({
            message: 'User registered successfully',
            user: {
                uid: userRecord.uid,
                email: userRecord.email,
                role: role
            }
        });

    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ error: error.message });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Missing email or password' });
        }

        // 1. Verify credentials using Firebase REST API
        // We need the Web API Key for this. It should be in the .env file.
        const apiKey = process.env.FIREBASE_WEB_API_KEY;

        if (!apiKey) {
            console.error('FIREBASE_WEB_API_KEY is not set in environment variables');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

        const response = await fetch(authUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || 'Authentication failed');
        }

        const { localId, idToken } = data;

        // 2. Fetch user details from Firestore to get the role
        const userDoc = await db.collection('users').doc(localId).get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User profile not found' });
        }

        const userData = userDoc.data();

        res.status(200).json({
            message: 'Login successful',
            token: idToken,
            user: {
                uid: localId,
                email: userData.email,
                username: userData.username,
                role: userData.role,
                sportType: userData.sportType, // optional
                teamName: userData.teamName    // optional
            }
        });

    } catch (error) {
        console.error('Login error:', error.message);
        res.status(401).json({ error: 'Invalid email or password' });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { uid } = req.params;
        const { username, sportType, teamName, profileImage } = req.body;

        if (!uid) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        const updates = {};
        if (username) updates.username = username;
        if (sportType) updates.sportType = sportType;
        if (teamName) updates.teamName = teamName;
        if (profileImage) updates.profileImage = profileImage;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        await db.collection('users').doc(uid).update(updates);

        // Fetch updated user data
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();

        res.status(200).json({
            message: 'Profile updated successfully',
            user: {
                uid: uid,
                email: userData.email,
                username: userData.username,
                role: userData.role,
                sportType: userData.sportType,
                teamName: userData.teamName,
                profileImage: userData.profileImage
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
};

module.exports = {
    register,
    login,
    updateProfile
};
