const groundConfig = {
    // 3 Grounds, 06:00 - 22:00
    Rugby: { count: 3, start: 6, end: 22, prefix: 'Rugby Ground' },
    Elle: { count: 3, start: 6, end: 22, prefix: 'Elle Ground' },
    Cricket: { count: 3, start: 6, end: 22, prefix: 'Cricket Ground' },
    Football: { count: 3, start: 6, end: 22, prefix: 'Football Ground' },
    'Track Events': { count: 3, start: 6, end: 22, prefix: 'Track' },

    // 2 Grounds, 06:00 - 22:00
    Volleyball: { count: 2, start: 6, end: 22, prefix: 'Volleyball Court' },

    // 2 Courts, 08:00 - 22:00
    Badminton: { count: 2, start: 8, end: 22, prefix: 'Badminton Court' },
    'Table Tennis': { count: 2, start: 8, end: 22, prefix: 'Table Tennis Table' },
};

const getGroundsForSport = (sport) => {
    const config = groundConfig[sport];
    if (!config) return [];

    const grounds = [];
    for (let i = 1; i <= config.count; i++) {
        grounds.push({
            groundId: `${sport.replace(/\s+/g, '').toLowerCase()}_${i}`,
            groundName: `${config.prefix} ${String.fromCharCode(64 + i)}` // A, B, C...
        });
    }
    return grounds;
};

const generateTimeSlots = (sport) => {
    const config = groundConfig[sport];
    if (!config) return [];

    const slots = [];
    for (let hour = config.start; hour < config.end; hour += 2) {
        const start = hour.toString().padStart(2, '0') + ':00';
        const end = (hour + 2).toString().padStart(2, '0') + ':00';
        slots.push(`${start} - ${end}`);
    }
    return slots;
};

module.exports = { groundConfig, getGroundsForSport, generateTimeSlots };
