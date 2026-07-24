const fs = require('fs');
const path = require('path');
const { supabase } = require('../services/supabaseService');

// File fallback path
const STATE_FILE_PATH = path.join(__dirname, '../user-reminders.json');

function getTodayString() {
    const now = new Date();
    // Use Asia/Kolkata (IST) timezone matching existing database dates
    const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const date = new Date(istString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getInitialState() {
    return {
        date: getTodayString(),
        channels: {} // maps communityProgressChannelId -> { posted: [], reminded: { first: [], second: [], inactive: [] } }
    };
}

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE_PATH)) {
            const data = fs.readFileSync(STATE_FILE_PATH, 'utf8');
            const parsed = JSON.parse(data);
            const today = getTodayString();
            
            if (parsed && parsed.date === today) {
                parsed.channels = parsed.channels || {};
                return parsed;
            }
        }
    } catch (error) {
        console.error('⚠️ [Progress Reminder] Error reading state file fallback:', error.message);
    }
    
    const freshState = getInitialState();
    saveState(freshState);
    return freshState;
}

function saveState(state) {
    try {
        fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf8');
    } catch (error) {
        console.error('❌ [Progress Reminder] Error writing state file fallback:', error.message);
    }
}

let currentState = loadState();

function refreshStateDate() {
    const today = getTodayString();
    if (currentState.date !== today) {
        console.log(`🌅 [Progress Reminder] New day detected (${today}). Resetting tracking state.`);
        currentState = getInitialState();
        saveState(currentState);
    }
}

function ensureChannelState(channelId) {
    if (!currentState.channels) {
        currentState.channels = {};
    }
    if (!currentState.channels[channelId]) {
        currentState.channels[channelId] = {
            posted: [],
            reminded: {
                first: [],
                second: [],
                inactive: []
            }
        };
    }
    if (!currentState.channels[channelId].reminded) {
        currentState.channels[channelId].reminded = {
            first: [],
            second: [],
            inactive: []
        };
    }
}

const stateManager = {
    // Check if Supabase client is connected and configured
    isDbConfigured() {
        return !!supabase;
    },

    // 1. Progress updates (posted) tracking
    async markPosted(channelId, userId) {
        // Sync local file cache fallback
        refreshStateDate();
        ensureChannelState(channelId);
        if (!currentState.channels[channelId].posted.includes(userId)) {
            currentState.channels[channelId].posted.push(userId);
            saveState(currentState);
            console.log(`✅ [Progress Reminder] Local cache marked user ${userId} as posted for channel ${channelId}.`);
        }
    },
    
    async getPostedMembersToday(channelId, trackedMembers) {
        refreshStateDate();
        ensureChannelState(channelId);

        // A. Database check (Source of truth)
        if (this.isDbConfigured()) {
            try {
                const todayStr = getTodayString();
                const { data, error } = await supabase
                    .from('progress_updates')
                    .select('discord_user_id')
                    .eq('update_date', todayStr)
                    .in('discord_user_id', trackedMembers);

                if (!error && data) {
                    const postedSet = new Set(data.map(row => row.discord_user_id));
                    // Synchronize local file cache
                    currentState.channels[channelId].posted = Array.from(postedSet);
                    saveState(currentState);
                    return postedSet;
                }
            } catch (err) {
                console.warn('⚠️ [Progress Reminder] Database fetch of posted members failed, using local file cache fallback:', err.message);
            }
        }

        // B. File fallback
        return new Set(currentState.channels[channelId].posted);
    },

    // 2. Inactive members (missed 2 consecutive days) tracking
    async getInactiveMembers(trackedMembers) {
        if (!this.isDbConfigured()) {
            console.warn('⚠️ [Progress Reminder] Database is required to calculate consecutive inactive days. Local file cannot trace historical dates. Returning empty.');
            return [];
        }

        try {
            const now = new Date();
            const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
            const todayDate = new Date(istString);
            
            // Format helper
            const format = (date) => {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            };

            // Calculate yesterday and day before yesterday
            const yesterdayDate = new Date(todayDate);
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterday = format(yesterdayDate);

            const dayBeforeYesterdayDate = new Date(todayDate);
            dayBeforeYesterdayDate.setDate(dayBeforeYesterdayDate.getDate() - 2);
            const dayBefore = format(dayBeforeYesterdayDate);

            console.log(`🔍 [Progress Reminder] Checking consecutive inactivity for dates: ${yesterday} and ${dayBefore}`);

            // Fetch progress update records for tracked members on both yesterday and dayBefore
            const { data, error } = await supabase
                .from('progress_updates')
                .select('discord_user_id, update_date')
                .in('update_date', [yesterday, dayBefore])
                .in('discord_user_id', trackedMembers);

            if (error) throw error;

            // Map user IDs to the dates they posted
            const userPostDates = {};
            trackedMembers.forEach(id => {
                userPostDates[id] = new Set();
            });

            if (data) {
                data.forEach(row => {
                    if (userPostDates[row.discord_user_id]) {
                        userPostDates[row.discord_user_id].add(row.update_date);
                    }
                });
            }

            // Inactive users have posted on neither yesterday nor dayBefore
            const inactiveMembers = trackedMembers.filter(userId => {
                const postedDates = userPostDates[userId];
                return !postedDates.has(yesterday) && !postedDates.has(dayBefore);
            });

            return inactiveMembers;
        } catch (err) {
            console.error('❌ [Progress Reminder] Error calculating inactive members from DB:', err.message);
            return [];
        }
    },

    // 3. Reminders tracking
    async markReminded(channelId, userId, type) {
        refreshStateDate();
        ensureChannelState(channelId);
        
        // A. Database write
        if (this.isDbConfigured()) {
            try {
                const todayStr = getTodayString();
                const { error } = await supabase
                    .from('progress_reminder_logs')
                    .insert({
                        community_progress_channel_id: channelId,
                        discord_user_id: userId,
                        reminder_type: type,
                        reminder_date: todayStr
                    });

                if (!error) {
                    console.log(`📢 [Progress Reminder] Logged reminder (${type}) for user ${userId} in database.`);
                }
            } catch (err) {
                console.warn('⚠️ [Progress Reminder] Database logging failed, using local file cache:', err.message);
            }
        }

        // B. File fallback write
        if (!currentState.channels[channelId].reminded[type]) {
            currentState.channels[channelId].reminded[type] = [];
        }
        if (!currentState.channels[channelId].reminded[type].includes(userId)) {
            currentState.channels[channelId].reminded[type].push(userId);
            saveState(currentState);
            console.log(`📢 [Progress Reminder] Logged reminder (${type}) for user ${userId} in local cache.`);
        }
    },
    
    async isReminded(channelId, userId, type) {
        refreshStateDate();
        ensureChannelState(channelId);

        // A. Database check
        if (this.isDbConfigured()) {
            try {
                const todayStr = getTodayString();
                const { data, error } = await supabase
                    .from('progress_reminder_logs')
                    .select('id')
                    .eq('community_progress_channel_id', channelId)
                    .eq('discord_user_id', userId)
                    .eq('reminder_type', type)
                    .eq('reminder_date', todayStr)
                    .limit(1);

                if (!error && data) {
                    return data.length > 0;
                }
            } catch (err) {
                console.warn('⚠️ [Progress Reminder] Database lookup failed, using local file cache fallback:', err.message);
            }
        }

        // B. File check
        const remindedList = currentState.channels[channelId].reminded[type] || [];
        return remindedList.includes(userId);
    },
    
    resetStateForNewDay() {
        currentState = getInitialState();
        saveState(currentState);
        console.log(`🔄 [Progress Reminder] Reset state for new day manually: ${currentState.date}`);
    },

    getTodayString,
    
    getCurrentState() {
        refreshStateDate();
        return currentState;
    }
};

module.exports = stateManager;
