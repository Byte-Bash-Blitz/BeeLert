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
        if (!state.isDbConfigured()) {
            return res.json({
                success: true,
                dbConfigured: false,
                reminderLogs: [],
                progressUpdates: []
            });
        }

        try {
            // A. Fetch recent reminder logs (limit 15)
            const { data: reminderLogs, error: logError } = await supabase
                .from('progress_reminder_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(15);

            if (logError) throw logError;

            // B. Fetch recent progress updates (limit 15)
            const { data: progressUpdates, error: updateError } = await supabase
                .from('progress_updates')
                .select('discord_user_id, username, points_awarded, current_streak, update_date, created_at')
                .order('created_at', { ascending: false })
                .limit(15);

            if (updateError) throw updateError;

            res.json({
                success: true,
                dbConfigured: true,
                reminderLogs: reminderLogs || [],
                progressUpdates: progressUpdates || []
            });
        } catch (error) {
            console.error('❌ [Progress Reminder API] Error fetching DB logs:', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // 3. POST TRIGGER: Manually execute a reminder check
    router.post('/trigger', async (req, res) => {
        const { pairIndex, type } = req.body;
        
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
