const fs = require('fs');
const path = require('path');
const config = require('./config');
const { supabase, isSupabaseConfigured } = require('../services/supabaseService');

const DEFAULT_DATA = {
    users: {},            // userId -> { xp, level, communityPoints, solvedQuestions: [], attempts: 0, accuracy: 0, badges: [], currentStreak: 0, highestStreak: 0, lastSolvedDate: null, languageStats: {} }
    activeChallenge: null, // { id, title, description, difficulty, category, testCases, hint, postedAt, solves: [], firstSolverId: null, fastestSolverId: null, fastestTimeMs: null }
    questionBank: [],     // Array of challenge objects
    submissions: []       // Array of submission objects for history/anti-cheat
};

let localData = { ...DEFAULT_DATA };

// Ensure data directory exists
function ensureDataDir() {
    const dir = path.dirname(config.dataPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Load local JSON data
function loadLocalData() {
    try {
        ensureDataDir();
        if (fs.existsSync(config.dataPath)) {
            const raw = fs.readFileSync(config.dataPath, 'utf8');
            localData = JSON.parse(raw);
            console.log('✅ [Programming Challenge DB] Local data loaded.');
        } else {
            saveLocalData();
        }
    } catch (err) {
        console.error('❌ [Programming Challenge DB] Error loading local data:', err.message);
        localData = { ...DEFAULT_DATA };
    }
}

// Save local JSON data
function saveLocalData() {
    try {
        ensureDataDir();
        fs.writeFileSync(config.dataPath, JSON.stringify(localData, null, 2), 'utf8');
    } catch (err) {
        console.error('❌ [Programming Challenge DB] Error saving local data:', err.message);
    }
}

// Initialize DB
async function initDB() {
    loadLocalData();
    if (isSupabaseConfigured()) {
        try {
            console.log('📡 [Programming Challenge DB] Supabase connected.');
        } catch (err) {
            console.warn('⚠️ [Programming Challenge DB] Supabase check warning:', err.message);
        }
    }
}

// Get User Profile
async function getUserProfile(userId) {
    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabase
                .from('user_programming_stats')
                .select('*')
                .eq('user_id', userId)
                .single();
            if (data && !error) {
                return {
                    userId: data.user_id,
                    xp: data.xp || 0,
                    level: Math.floor((data.xp || 0) / 100) + 1,
                    communityPoints: data.community_points || 0,
                    solvedQuestions: data.solved_questions || [],
                    attempts: data.attempts || 0,
                    accuracy: data.attempts > 0 ? parseFloat((((data.solved_questions || []).length / data.attempts) * 100).toFixed(1)) : 0,
                    badges: data.badges || [],
                    currentStreak: data.current_streak || 0,
                    highestStreak: data.highest_streak || 0,
                    lastSolvedDate: data.last_solved_date,
                    languageStats: data.language_stats || {}
                };
            }
        } catch (e) {
            // Fallback to local
        }
    }

    if (!localData.users[userId]) {
        localData.users[userId] = {
            userId,
            xp: 0,
            level: 1,
            communityPoints: 0,
            solvedQuestions: [],
            attempts: 0,
            accuracy: 0,
            badges: [],
            currentStreak: 0,
            highestStreak: 0,
            lastSolvedDate: null,
            languageStats: {}
        };
        saveLocalData();
    }
    const user = localData.users[userId];
    user.level = Math.floor((user.xp || 0) / 100) + 1;
    user.accuracy = user.attempts > 0 ? parseFloat(((user.solvedQuestions.length / user.attempts) * 100).toFixed(1)) : 0;
    return user;
}

// Save User Profile
async function saveUserProfile(userProfile) {
    userProfile.level = Math.floor((userProfile.xp || 0) / 100) + 1;
    userProfile.accuracy = userProfile.attempts > 0 
        ? parseFloat(((userProfile.solvedQuestions.length / userProfile.attempts) * 100).toFixed(1)) 
        : 0;

    localData.users[userProfile.userId] = userProfile;
    saveLocalData();

    if (isSupabaseConfigured()) {
        try {
            await supabase
                .from('user_programming_stats')
                .upsert([{
                    user_id: userProfile.userId,
                    xp: userProfile.xp,
                    level: userProfile.level,
                    community_points: userProfile.communityPoints,
                    solved_questions: userProfile.solvedQuestions,
                    attempts: userProfile.attempts,
                    accuracy: userProfile.accuracy,
                    badges: userProfile.badges,
                    current_streak: userProfile.currentStreak,
                    highest_streak: userProfile.highestStreak,
                    last_solved_date: userProfile.lastSolvedDate,
                    language_stats: userProfile.languageStats,
                    updated_at: new Date().toISOString()
                }]);
        } catch (e) {
            console.error('❌ Supabase sync error for saveUserProfile:', e.message);
        }
    }
}

// Get Active Daily Challenge
async function getActiveChallenge() {
    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabase
                .from('programming_challenges')
                .select('*')
                .eq('is_active', true)
                .order('posted_at', { ascending: false })
                .limit(1)
                .single();

            if (data && !error) {
                return {
                    id: data.id,
                    title: data.title,
                    description: data.description,
                    difficulty: data.difficulty,
                    category: data.category,
                    testCases: data.test_cases || [],
                    hint: data.hint,
                    postedAt: data.posted_at,
                    solves: data.solves || [],
                    firstSolverId: data.first_solver_id,
                    fastestSolverId: data.fastest_solver_id,
                    fastestTimeMs: data.fastest_time_ms
                };
            }
        } catch (e) {
            // Fallback
        }
    }
    return localData.activeChallenge;
}

// Set Active Daily Challenge
async function setActiveChallenge(challenge) {
    localData.activeChallenge = challenge;
    saveLocalData();

    if (isSupabaseConfigured()) {
        try {
            // Deactivate previous challenges
            await supabase
                .from('programming_challenges')
                .update({ is_active: false })
                .eq('is_active', true);

            await supabase
                .from('programming_challenges')
                .upsert([{
                    id: challenge.id,
                    title: challenge.title,
                    description: challenge.description,
                    difficulty: challenge.difficulty,
                    category: challenge.category,
                    test_cases: challenge.testCases,
                    hint: challenge.hint,
                    posted_at: challenge.postedAt || new Date().toISOString(),
                    is_active: true,
                    solves: challenge.solves || [],
                    first_solver_id: challenge.firstSolverId || null,
                    fastest_solver_id: challenge.fastestSolverId || null,
                    fastest_time_ms: challenge.fastestTimeMs || null
                }]);
        } catch (e) {
            console.error('❌ Supabase sync error for setActiveChallenge:', e.message);
        }
    }
}

// Record Submission
async function recordSubmission(submission) {
    localData.submissions.push(submission);
    // Keep max 1000 submission logs locally
    if (localData.submissions.length > 1000) {
        localData.submissions = localData.submissions.slice(-1000);
    }
    saveLocalData();

    if (isSupabaseConfigured()) {
        try {
            await supabase
                .from('challenge_submissions')
                .insert([{
                    user_id: submission.userId,
                    challenge_id: submission.challengeId,
                    language: submission.language,
                    code: submission.code,
                    is_correct: submission.isCorrect,
                    submitted_at: submission.submittedAt || new Date().toISOString()
                }]);
        } catch (e) {
            console.error('❌ Supabase sync error for recordSubmission:', e.message);
        }
    }
}

// Get All Submissions for similarity check & anti-cheat
async function getRecentSubmissions(challengeId) {
    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabase
                .from('challenge_submissions')
                .select('*')
                .eq('challenge_id', challengeId)
                .order('submitted_at', { ascending: false })
                .limit(100);
            if (data && !error) {
                return data.map(d => ({
                    userId: d.user_id,
                    challengeId: d.challenge_id,
                    language: d.language,
                    code: d.code,
                    isCorrect: d.is_correct,
                    submittedAt: d.submitted_at
                }));
            }
        } catch (e) {
            // Fallback
        }
    }
    return localData.submissions.filter(s => s.challengeId === challengeId);
}

// Question Bank Operations
function getQuestionBank() {
    return localData.questionBank || [];
}

function saveQuestionBank(bank) {
    localData.questionBank = bank;
    saveLocalData();
}

// Leaderboard fetcher
async function getLeaderboardData() {
    let usersList = [];
    if (isSupabaseConfigured()) {
        try {
            const { data, error } = await supabase
                .from('user_programming_stats')
                .select('*')
                .order('xp', { ascending: false })
                .limit(100);
            if (data && !error && data.length > 0) {
                usersList = data.map(d => ({
                    userId: d.user_id,
                    xp: d.xp || 0,
                    level: d.level || Math.floor((d.xp || 0) / 100) + 1,
                    communityPoints: d.community_points || 0,
                    solved: (d.solved_questions || []).length,
                    streak: d.current_streak || 0,
                    highestStreak: d.highest_streak || 0,
                    accuracy: d.accuracy || 0,
                    lastSolvedDate: d.last_solved_date
                }));
            }
        } catch (e) {
            // Fallback
        }
    }

    if (usersList.length === 0) {
        usersList = Object.values(localData.users).map(u => ({
            userId: u.userId,
            xp: u.xp || 0,
            level: Math.floor((u.xp || 0) / 100) + 1,
            communityPoints: u.communityPoints || 0,
            solved: (u.solvedQuestions || []).length,
            streak: u.currentStreak || 0,
            highestStreak: u.highestStreak || 0,
            accuracy: u.attempts > 0 ? parseFloat(((u.solvedQuestions.length / u.attempts) * 100).toFixed(1)) : 0,
            lastSolvedDate: u.lastSolvedDate
        })).sort((a, b) => b.xp - a.xp);
    }

    return usersList;
}

// Leaderboard Reset Admin
async function resetLeaderboard() {
    localData.users = {};
    saveLocalData();
    if (isSupabaseConfigured()) {
        try {
            await supabase.from('user_programming_stats').delete().neq('user_id', '');
        } catch (e) {
            console.error('❌ Supabase reset leaderboard error:', e.message);
        }
    }
}

module.exports = {
    initDB,
    isSupabaseConfigured,
    getUserProfile,
    saveUserProfile,
    getActiveChallenge,
    setActiveChallenge,
    recordSubmission,
    getRecentSubmissions,
    getQuestionBank,
    saveQuestionBank,
    getLeaderboardData,
    resetLeaderboard
};
