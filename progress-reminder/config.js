const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const CONFIG_FILE_PATH = path.join(__dirname, '../progress-reminder-config.json');

function getTrackedMembers(rawMembers) {
    if (!rawMembers) return [];
    try {
        const parsed = JSON.parse(rawMembers);
        if (Array.isArray(parsed)) {
            return parsed.map(String);
        }
    } catch (error) {
        return rawMembers
            .replace(/[\[\]"\']/g, '')
            .split(',')
            .map(id => id.trim())
            .filter(Boolean);
    }
    return [];
}

let config = {
    pairs: []
};

// Sync fallback loader (runs on require)
function loadSyncFallback() {
    let loadedPairs = [];
    
    // A. Try loading from JSON configuration file
    if (fs.existsSync(CONFIG_FILE_PATH)) {
        try {
            const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
            const parsed = JSON.parse(fileContent);
            if (Array.isArray(parsed)) {
                loadedPairs = parsed.map(pair => ({
                    communityServerId: String(pair.communityServerId || '').trim(),
                    communityProgressChannelId: String(pair.communityProgressChannelId || '').trim(),
                    clanServerId: String(pair.clanServerId || '').trim(),
                    clanReminderChannelId: String(pair.clanReminderChannelId || '').trim(),
                    trackedMembers: Array.isArray(pair.trackedMembers) ? pair.trackedMembers.map(id => String(id).trim()) : [],
                    firstReminderTime: String(pair.firstReminderTime || pair.reminderTime || '21:00').trim(),
                    secondReminderTime: String(pair.secondReminderTime || '23:00').trim(),
                    inactiveAlertTime: String(pair.inactiveAlertTime || '10:00').trim()
                }));
            }
        } catch (error) {
            console.error('❌ [Progress Reminder] Error reading sync fallback json:', error.message);
        }
    }
    
    // B. Fallback to .env variables if no pairs were loaded from JSON
    if (loadedPairs.length === 0 && process.env.COMMUNITY_PROGRESS_CHANNEL_ID) {
        loadedPairs.push({
            communityServerId: String(process.env.COMMUNITY_SERVER_ID || '').trim(),
            communityProgressChannelId: String(process.env.COMMUNITY_PROGRESS_CHANNEL_ID || '').trim(),
            clanServerId: String(process.env.CLAN_SERVER_ID || '').trim(),
            clanReminderChannelId: String(process.env.CLAN_REMINDER_CHANNEL_ID || '').trim(),
            trackedMembers: getTrackedMembers(process.env.TRACKED_MEMBERS),
            firstReminderTime: String(process.env.FIRST_REMINDER_TIME || process.env.REMINDER_TIME || '21:00').trim(),
            secondReminderTime: String(process.env.SECOND_REMINDER_TIME || '23:00').trim(),
            inactiveAlertTime: String(process.env.INACTIVE_ALERT_TIME || '10:00').trim()
        });
    }
    
    config.pairs = loadedPairs;
}

// Initial fallback load
loadSyncFallback();

// Async DB loader
async function loadDatabaseConfig(supabase) {
    if (!supabase) {
        console.log('📋 [Progress Reminder] Database not configured. Using file/env configuration.');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('progress_reminder_config')
            .select('*')
            .eq('is_active', true);

        if (error) {
            throw error;
        }

        if (data && data.length > 0) {
            config.pairs = data.map((pair, index) => {
                const configPair = {
                    communityServerId: String(pair.community_server_id || '').trim(),
                    communityProgressChannelId: String(pair.community_progress_channel_id || '').trim(),
                    clanServerId: String(pair.clan_server_id || '').trim(),
                    clanReminderChannelId: String(pair.clan_reminder_channel_id || '').trim(),
                    trackedMembers: Array.isArray(pair.tracked_members) ? pair.tracked_members.map(id => String(id).trim()) : [],
                    firstReminderTime: String(pair.first_reminder_time || '21:00').trim(),
                    secondReminderTime: String(pair.second_reminder_time || '23:00').trim(),
                    inactiveAlertTime: String(pair.inactive_alert_time || '10:00').trim()
                };

                console.log(`📋 [Progress Reminder Config] Pair ${index + 1} loaded from DATABASE:`, {
                    communityServerId: configPair.communityServerId,
                    communityProgressChannelId: configPair.communityProgressChannelId,
                    clanServerId: configPair.clanServerId,
                    clanReminderChannelId: configPair.clanReminderChannelId,
                    trackedMembersCount: configPair.trackedMembers.length,
                    firstReminderTime: configPair.firstReminderTime,
                    secondReminderTime: configPair.secondReminderTime,
                    inactiveAlertTime: configPair.inactiveAlertTime
                });
                return configPair;
            });
        } else {
            console.log('📋 [Progress Reminder] Database config table is empty. Using file/env configuration.');
        }
    } catch (error) {
        console.warn(`⚠️ [Progress Reminder] Database config load failed (table might not exist yet): ${error.message}. Using file/env configuration.`);
    }
}

module.exports = {
    get pairs() {
        return config.pairs;
    },
    loadDatabaseConfig
};
