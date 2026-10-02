const express = require('express');
const config = require('./config');
const state = require('./state');
const notifier = require('./notifier');
const { supabase } = require('../services/supabaseService');

// In-memory cache for user details to avoid rate-limiting on API requests
const userDetailsCache = {};

async function getUserDetails(client, userId) {
    if (userDetailsCache[userId]) {
        return userDetailsCache[userId];
    }
    try {
        const user = await client.users.fetch(userId);
        if (user) {
            const details = {
                username: user.username,
                displayName: user.globalName || user.username,
                avatarUrl: user.displayAvatarURL({ dynamic: true, size: 128 })
            };
            userDetailsCache[userId] = details;
            return details;
        }
    } catch (e) {
        // Fallback if user cannot be fetched
    }
    return {
        username: `User (${userId.substring(0, 6)}...)`,
        displayName: `User (${userId.substring(0, 6)}...)`,
        avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png'
    };
}

function registerRoutes(app, client, botStatus) {
    const router = express.Router();

    // 1. GET STATUS: Fetch configurations, current progress state, and tracked members status
    router.get('/status', async (req, res) => {
        try {
            const resultPairs = [];
            const pairs = config.pairs;

            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                const channelId = pair.communityProgressChannelId;
                const trackedMembers = pair.trackedMembers;

                // Load posted users today (DB check with local cache fallback)
                const postedUsersSet = await state.getPostedMembersToday(channelId, trackedMembers);
                
                // Calculate inactive users (DB check with empty fallback)
                const inactiveUsers = state.isDbConfigured() ? await state.getInactiveMembers(trackedMembers) : [];

                const membersData = [];
                for (const userId of trackedMembers) {
                    const userDetails = await getUserDetails(client, userId);
                    
                    // Check reminder logs
                    const remindedFirst = await state.isReminded(channelId, userId, 'first');
                    const remindedSecond = await state.isReminded(channelId, userId, 'second');
                    const remindedInactive = await state.isReminded(channelId, userId, 'inactive');

                    membersData.push({
                        id: userId,
                        username: userDetails.username,
                        displayName: userDetails.displayName,
                        avatarUrl: userDetails.avatarUrl,
                        hasPosted: postedUsersSet.has(userId),
                        isInactive: inactiveUsers.includes(userId),
                        reminded: {
                            first: remindedFirst,
                            second: remindedSecond,
                            inactive: remindedInactive
                        }
                    });
                }

                resultPairs.push({
                    index: i,
                    communityServerId: pair.communityServerId,
                    communityProgressChannelId: pair.communityProgressChannelId,
                    clanServerId: pair.clanServerId,
                    clanReminderChannelId: pair.clanReminderChannelId,
                    firstReminderTime: pair.firstReminderTime,
                    secondReminderTime: pair.secondReminderTime,
                    inactiveAlertTime: pair.inactiveAlertTime,
                    members: membersData
                });
            }

            res.json({
                success: true,
                dbConfigured: state.isDbConfigured(),
                botStatus: {
                    isOnline: botStatus ? botStatus.isOnline : false,
                    uptime: botStatus && botStatus.connectedAt ? Math.floor((Date.now() - new Date(botStatus.connectedAt)) / 1000) : 0,
                    connectedAt: botStatus ? botStatus.connectedAt : null,
                    totalMessagesSent: botStatus ? botStatus.totalMessagesSent : 0,
                    lastMessageSent: botStatus ? botStatus.lastMessageSent : null
                },
                pairs: resultPairs
            });
        } catch (error) {
            console.error('❌ [Progress Reminder API] Error fetching status:', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 2. GET DATABASE LOGS: Query recent logs and updates from Supabase
    router.get('/database-logs', async (req, res) => {
        const fs = require('fs');
        const path = require('path');

        if (!state.isDbConfigured()) {
            let localSessions = [];
            try {
                const lp = path.join(__dirname, '../voice-monitor-sessions.json');
                if (fs.existsSync(lp)) localSessions = JSON.parse(fs.readFileSync(lp, 'utf8') || '[]');
            } catch (e) {}

            return res.json({
                success: true,
                dbConfigured: false,
                reminderLogs: [],
                progressUpdates: [],
                voiceSessions: localSessions,
                voiceReports: []
            });
        }

        try {
            // A. Fetch recent reminder logs (limit 15)
            const { data: reminderLogs, error: logError } = await supabase
                .from('progress_reminder_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(15);

            // B. Fetch recent progress updates (limit 15)
            const { data: progressUpdates, error: updateError } = await supabase
                .from('progress_updates')
                .select('discord_user_id, username, points_awarded, current_streak, update_date, created_at')
                .order('created_at', { ascending: false })
                .limit(15);

            // C. Fetch recent 4-clan voice sessions from Supabase (limit 50)
            let voiceSessions = [];
            try {
                const { data: vsData, error: vsError } = await supabase
                    .from('daily_voice_monitor_sessions')
                    .select('*')
                    .order('join_time', { ascending: false })
                    .limit(50);
                if (!vsError && vsData && vsData.length > 0) {
                    voiceSessions = vsData;
                }
            } catch (vsErr) {
                console.warn('⚠️ [Progress Reminder API] Failed fetching voice sessions from Supabase:', vsErr.message);
            }

            // Fallback to local sessions if Supabase table is empty
            if (voiceSessions.length === 0) {
                try {
                    const lp = path.join(__dirname, '../voice-monitor-sessions.json');
                    if (fs.existsSync(lp)) voiceSessions = JSON.parse(fs.readFileSync(lp, 'utf8') || '[]');
                } catch (e) {}
            }

            // D. Fetch recent 11 PM voice report logs (limit 15)
            let voiceReports = [];
            try {
                const { data: vrData, error: vrError } = await supabase
                    .from('daily_voice_report_logs')
                    .select('*')
                    .order('sent_at', { ascending: false })
                    .limit(15);
                if (!vrError && vrData && vrData.length > 0) {
                    voiceReports = vrData;
                }
            } catch (vrErr) {}

            if (voiceReports.length === 0) {
                try {
                    const rp = path.join(__dirname, '../voice-monitor-reports.json');
                    if (fs.existsSync(rp)) voiceReports = JSON.parse(fs.readFileSync(rp, 'utf8') || '[]');
                } catch (e) {}
            }

            // Exclude test/mock artifacts from live dashboard
            const cleanVoiceSessions = (voiceSessions || []).filter(s => {
                const uid = String(s.discord_user_id || s.discordUserId || '').toLowerCase();
                const uname = String(s.username || s.displayName || s.display_name || '').toLowerCase();
                const sDate = String(s.session_date || s.sessionDate || '');
                return !uid.includes('test') && !uid.includes('hero') && !uname.includes('test') && !uname.includes('hero') && sDate !== '2099-05-15';
            });

            const cleanVoiceReports = (voiceReports || []).filter(r => {
                const rDate = String(r.report_date || r.reportDate || '');
                return rDate !== '2099-05-15';
            });

            const cleanReminderLogs = (reminderLogs || []).filter(l => {
                const uid = String(l.discord_user_id || '').toLowerCase();
                return !uid.includes('test') && !uid.includes('hero') && l.reminder_date !== '2099-05-15';
            });

            res.json({
                success: true,
                dbConfigured: !logError && !updateError,
                reminderLogs: cleanReminderLogs,
                progressUpdates: progressUpdates || [],
                voiceSessions: cleanVoiceSessions,
                voiceReports: voiceReports || []
            });
        } catch (error) {
            console.warn('⚠️ [Progress Reminder API] DB logs fallback:', error.message);
            res.json({ success: true, dbConfigured: false, reminderLogs: [], progressUpdates: [], voiceSessions: [], voiceReports: [] });
        }
    });

    // 3. POST TRIGGER: Manually execute a reminder check
    router.post('/trigger', async (req, res) => {
        const { pairIndex, type } = req.body || {};
        
        const idx = parseInt(pairIndex, 10);
        if (isNaN(idx) || idx < 0 || idx >= config.pairs.length) {
            return res.status(400).json({ success: false, error: 'Invalid pairIndex parameter' });
        }

        if (!['first', 'second', 'inactive'].includes(type)) {
            return res.status(400).json({ success: false, error: 'Invalid type parameter (must be first, second, or inactive)' });
        }

        const pair = config.pairs[idx];
        console.log(`📡 [Progress Reminder API] Manual trigger received: pair ${idx + 1}, alert type: ${type}`);

        try {
            if (type === 'first') {
                await notifier.runFirstReminder(client, pair, idx);
            } else if (type === 'second') {
                await notifier.runSecondReminder(client, pair, idx);
            } else if (type === 'inactive') {
                await notifier.runInactiveAlert(client, pair, idx);
            }
            res.json({ success: true, message: `Successfully triggered ${type} reminder execution.` });
        } catch (error) {
            console.error(`❌ [Progress Reminder API] Manual trigger failed:`, error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.use('/api/progress-reminder', router);
    console.log('✅ [Progress Reminder API] REST endpoints registered at /api/progress-reminder');
}

module.exports = {
    registerRoutes
};
