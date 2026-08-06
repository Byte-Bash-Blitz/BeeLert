const path = require('path');
require('dotenv').config();

module.exports = {
    // Discord IDs
    serverId: process.env.PROGRAMMING_SERVER_ID || '',
    channelId: process.env.PROGRAMMING_CHANNEL_ID || '',

    // Schedule: 8:00 AM every day
    cronSchedule: process.env.PROGRAMMING_CRON || '0 8 * * *',
    timezone: 'Asia/Kolkata', // IST timezone default

    // XP Rewards
    xpRewards: {
        Easy: 5,
        Medium: 10,
        Hard: 20
    },

    // Community Points Reward
    communityPointsReward: 5,

    // Bonus XP
    bonuses: {
        firstSolve: 10,
        fastestAnswer: 15,
        perfectWeek: 50
    },

    // Badges configuration
    badges: {
        FIRST_SOLVE: { id: 'first_solve', name: 'First Solve', icon: '🎯', description: 'Solved your first programming challenge' },
        STREAK_7: { id: 'streak_7', name: '7 Day Streak', icon: '🔥', description: 'Maintained a 7-day challenge streak' },
        STREAK_30: { id: 'streak_30', name: '30 Day Streak', icon: '⚡', description: 'Maintained a 30-day challenge streak' },
        SOLVES_100: { id: 'solves_100', name: '100 Solves', icon: '💯', description: 'Solved 100 programming challenges' },
        XP_500: { id: 'xp_500', name: '500 XP', icon: '⭐', description: 'Earned 500 XP in programming challenges' },
        ALGORITHM_MASTER: { id: 'algo_master', name: 'Algorithm Master', icon: '🧠', description: 'Solved 10+ Algorithm & Data Structure challenges' },
        PYTHON_MASTER: { id: 'python_master', name: 'Python Master', icon: '🐍', description: 'Solved 10+ Python challenges' },
        JAVA_MASTER: { id: 'java_master', name: 'Java Master', icon: '☕', description: 'Solved 10+ Java challenges' },
        CSHARP_MASTER: { id: 'csharp_master', name: 'C# Master', icon: '🔷', description: 'Solved 10+ C# challenges' }
    },

    // Supported languages mapping
    languages: {
        python: { name: 'Python', aliases: ['py', 'python3'] },
        java: { name: 'Java', aliases: ['java'] },
        csharp: { name: 'C#', aliases: ['cs', 'c#'] },
        javascript: { name: 'JavaScript', aliases: ['js', 'node'] },
        cpp: { name: 'C++', aliases: ['cpp', 'cplusplus'] },
        c: { name: 'C', aliases: ['c'] }
    },

    // Local data persistence path
    dataPath: path.join(__dirname, 'data', 'challenge_data.json')
};
