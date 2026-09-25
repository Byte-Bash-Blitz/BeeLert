const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const LOCAL_SESSIONS_FILE = path.join(__dirname, '..', 'voice-monitor-sessions.json');
const LOCAL_REPORTS_FILE = path.join(__dirname, '..', 'voice-monitor-reports.json');
const LOCAL_ACTIVE_FILE = path.join(__dirname, '..', 'voice-monitor-active.json');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;
let isSupabaseReady = false;

if (supabaseUrl && supabaseKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
        isSupabaseReady = true;
    } catch (e) {
        console.warn('⚠️ [Voice Monitor DB] Supabase client init failed:', e.message);
    }
}

// Local JSON File Helpers
function loadLocalJson(filePath, defaultVal = []) {
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error(`❌ [Voice Monitor DB] Error reading ${filePath}:`, e.message);
    }
    return defaultVal;
}

function saveLocalJson(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`❌ [Voice Monitor DB] Error writing ${filePath}:`, e.message);
    }
}

/**
 * Save active sessions to persistent file for bot restart safety
 */
function saveActiveSessions(activeMap) {
    const arr = Array.from(activeMap.values());
    saveLocalJson(LOCAL_ACTIVE_FILE, arr);
}

/**
 * Load active sessions from persistent file
 */
function loadActiveSessions() {
    return loadLocalJson(LOCAL_ACTIVE_FILE, []);
}

/**
 * Remove an active session for a user
 */
function removeActiveSession(userId) {
    const list = loadLocalJson(LOCAL_ACTIVE_FILE, []);
    const filtered = list.filter(s => s.discordUserId !== userId);
    saveLocalJson(LOCAL_ACTIVE_FILE, filtered);
}

/**
 * Save a completed or updated voice session.
 */
async function saveVoiceSession(sessionData) {
    const {
        sessionId,
        discordUserId,
        username,
        displayName,
        clanName,
        guildId,
        voiceChannelId,
        joinTime,
        leaveTime,
        durationSeconds,
        sessionDate
    } = sessionData;

    const resolvedClan = clanName || (config.getClanByChannelId(voiceChannelId)?.name) || 'UNKNOWN';
    const resolvedDisplayName = displayName || username || `user_${discordUserId}`;
    const resolvedUsername = username || resolvedDisplayName;

    // 1. Local Backup Storage
    const local = loadLocalJson(LOCAL_SESSIONS_FILE, []);
    const idx = local.findIndex(s => s.sessionId === sessionId);
    const sessionObj = {
        sessionId,
        discordUserId,
        username: resolvedUsername,
        displayName: resolvedDisplayName,
        clanName: resolvedClan,
        guildId,
        voiceChannelId,
        joinTime: new Date(joinTime).toISOString(),
        leaveTime: leaveTime ? new Date(leaveTime).toISOString() : null,
        durationSeconds: durationSeconds || 0,
        sessionDate
    };

    if (idx >= 0) {
        local[idx] = sessionObj;
    } else {
        local.push(sessionObj);
    }
    saveLocalJson(LOCAL_SESSIONS_FILE, local);

    // 2. Supabase Storage (if connected)
    if (isSupabaseReady) {
        try {
            const basePayload = {
                session_id: sessionId,
                discord_user_id: discordUserId,
                username: resolvedUsername,
                guild_id: guildId,
                voice_channel_id: voiceChannelId,
                join_time: new Date(joinTime).toISOString(),
                leave_time: leaveTime ? new Date(leaveTime).toISOString() : null,
                duration_seconds: durationSeconds || 0,
                session_date: sessionDate
            };

            // Attempt upsert with clan_name and display_name if columns exist
            let { error } = await supabase
                .from('daily_voice_monitor_sessions')
                .upsert({
                    ...basePayload,
                    display_name: resolvedDisplayName,
                    clan_name: resolvedClan
                }, { onConflict: 'session_id' });

            if (error && (error.message.includes('column') || error.code === 'PGRST204')) {
                // Retry without optional columns if Supabase schema has not been migrated
                const retry = await supabase
                    .from('daily_voice_monitor_sessions')
                    .upsert(basePayload, { onConflict: 'session_id' });
                error = retry.error;
            }

            if (error) {
                console.warn('⚠️ [Voice Monitor DB] Supabase upsert session error:', error.message);
            }
        } catch (e) {
            console.warn('⚠️ [Voice Monitor DB] Supabase session save exception:', e.message);
        }
    }

    return sessionObj;
}

/**
 * Get all completed sessions for a specific date (YYYY-MM-DD in IST).
 */
async function getSessionsForDate(dateStr) {
    if (isSupabaseReady) {
        try {
            const { data, error } = await supabase
                .from('daily_voice_monitor_sessions')
                .select('*')
                .eq('session_date', dateStr);

            if (!error && data && data.length > 0) {
                return data.map(s => ({
                    sessionId: s.session_id,
                    discordUserId: s.discord_user_id,
                    username: s.username,
                    displayName: s.display_name || s.username || `user_${s.discord_user_id}`,
                    clanName: s.clan_name || (config.getClanByChannelId(s.voice_channel_id)?.name) || 'UNKNOWN',
                    guildId: s.guild_id,
                    voiceChannelId: s.voice_channel_id,
                    joinTime: s.join_time,
                    leaveTime: s.leave_time,
                    durationSeconds: s.duration_seconds,
                    sessionDate: s.session_date
                }));
            }
        } catch (e) {
            console.warn('⚠️ [Voice Monitor DB] Supabase query error, fallback to local JSON:', e.message);
        }
    }

    const local = loadLocalJson(LOCAL_SESSIONS_FILE, []);
    return local
        .filter(s => s.sessionDate === dateStr)
        .map(s => ({
            ...s,
            displayName: s.displayName || s.username || `user_${s.discordUserId}`,
            clanName: s.clanName || (config.getClanByChannelId(s.voiceChannelId)?.name) || 'UNKNOWN'
        }));
}

/**
 * Check if the 11 PM report for a specific date was already sent.
 */
async function hasReportBeenSent(dateStr) {
    if (isSupabaseReady) {
        try {
            const { data, error } = await supabase
                .from('daily_voice_report_logs')
                .select('id')
                .eq('report_date', dateStr)
                .limit(1);

            if (!error && data && data.length > 0) {
                return true;
            }
        } catch (e) {
            // ignore
        }
    }

    const reports = loadLocalJson(LOCAL_REPORTS_FILE, []);
    return reports.some(r => r.reportDate === dateStr);
}

/**
 * Mark 11 PM report as sent for a date.
 */
async function markReportSent(dateStr, stats = {}) {
    const reports = loadLocalJson(LOCAL_REPORTS_FILE, []);
    if (!reports.some(r => r.reportDate === dateStr)) {
        reports.push({ reportDate: dateStr, sentAt: new Date().toISOString(), ...stats });
        saveLocalJson(LOCAL_REPORTS_FILE, reports);
    }

    if (isSupabaseReady) {
        try {
            await supabase
                .from('daily_voice_report_logs')
                .upsert({
                    report_date: dateStr,
                    sent_at: new Date().toISOString(),
                    active_members_count: stats.activeMembersCount || 0,
                    total_seconds: stats.totalSeconds || 0
                }, { onConflict: 'report_date' });
        } catch (e) {
            // ignore
        }
    }
}

module.exports = {
    saveVoiceSession,
    getSessionsForDate,
    hasReportBeenSent,
    markReportSent,
    saveActiveSessions,
    loadActiveSessions,
    removeActiveSession
};
