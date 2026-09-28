const fs = require('fs');
const path = require('path');
const config = require('./config');
const supabaseService = require('../services/supabaseService');

const LOCAL_SESSIONS_FILE = path.join(__dirname, '..', 'voice-monitor-sessions.json');
const LOCAL_REPORTS_FILE = path.join(__dirname, '..', 'voice-monitor-reports.json');
const LOCAL_ACTIVE_FILE = path.join(__dirname, '..', 'voice-monitor-active.json');

// Get shared Supabase client
function getSupabase() {
    return supabaseService.supabase;
}

function isDbReady() {
    return supabaseService.isSupabaseConfigured() && !!getSupabase();
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
 * Dual-persistence: Saves to Supabase (both dedicated table if migrated AND existing voice_sessions table)
 * plus local file backup.
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
    const durSec = durationSeconds || 0;
    const durMin = Math.ceil(durSec / 60);
    const pts = Math.floor(durSec / 300);

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
        durationSeconds: durSec,
        sessionDate
    };

    if (idx >= 0) {
        local[idx] = sessionObj;
    } else {
        local.push(sessionObj);
    }
    saveLocalJson(LOCAL_SESSIONS_FILE, local);

    // 2. Supabase Storage (if connected)
    if (isDbReady()) {
        const supabase = getSupabase();

        // 2a. Attempt upsert to daily_voice_monitor_sessions if table exists
        try {
            const basePayload = {
                session_id: sessionId,
                discord_user_id: discordUserId,
                username: resolvedUsername,
                display_name: resolvedDisplayName,
                clan_name: resolvedClan,
                guild_id: guildId,
                voice_channel_id: voiceChannelId,
                join_time: new Date(joinTime).toISOString(),
                leave_time: leaveTime ? new Date(leaveTime).toISOString() : null,
                duration_seconds: durSec,
                session_date: sessionDate
            };

            const { error: dError } = await supabase
                .from('daily_voice_monitor_sessions')
                .upsert(basePayload, { onConflict: 'session_id' });

            if (!dError) {
                console.log(`[Voice Monitor DB] Persisted session ${sessionId} to daily_voice_monitor_sessions`);
            }
        } catch (e) {
            // Table may not exist yet in schema cache
        }

        // 2b. Always persist to existing voice_sessions table
        try {
            // Encode structured metadata into channel_name for full reconstruction
            const channelDescription = `${resolvedClan} | dur:${durSec} | ${resolvedDisplayName} | sid:${sessionId}`;
            const { error: vsError } = await supabase
                .from('voice_sessions')
                .insert([{
                    discord_user_id: discordUserId,
                    username: resolvedDisplayName,
                    channel_id: voiceChannelId,
                    channel_name: channelDescription,
                    duration_minutes: durMin,
                    points_earned: pts,
                    session_date: new Date(joinTime).toISOString()
                }]);

            if (vsError) {
                console.warn('⚠️ [Voice Monitor DB] voice_sessions insert warning:', vsError.message);
            } else {
                console.log(`[Voice Monitor DB] Persisted session to voice_sessions for ${resolvedDisplayName} (${durSec}s)`);
            }
        } catch (e) {
            console.warn('⚠️ [Voice Monitor DB] voice_sessions save exception:', e.message);
        }
    }

    return sessionObj;
}

/**
 * Get all completed sessions for a specific date (YYYY-MM-DD in IST).
 * Queries Supabase first (daily_voice_monitor_sessions or voice_sessions),
 * merged with local file backup.
 */
async function getSessionsForDate(dateStr) {
    const sessionMap = new Map(); // sessionId -> session object

    // 1. Try daily_voice_monitor_sessions from Supabase
    if (isDbReady()) {
        const supabase = getSupabase();
        try {
            const { data, error } = await supabase
                .from('daily_voice_monitor_sessions')
                .select('*')
                .eq('session_date', dateStr);

            if (!error && data && data.length > 0) {
                data.forEach(s => {
                    sessionMap.set(s.session_id, {
                        sessionId: s.session_id,
                        discordUserId: s.discord_user_id,
                        username: s.username,
                        displayName: s.display_name || s.username || `user_${s.discord_user_id}`,
                        clanName: s.clan_name || (config.getClanByChannelId(s.voice_channel_id)?.name) || 'UNKNOWN',
                        guildId: s.guild_id,
                        voiceChannelId: s.voice_channel_id,
                        joinTime: s.join_time,
                        leaveTime: s.leave_time,
                        durationSeconds: s.duration_seconds || 0,
                        sessionDate: s.session_date
                    });
                });
            }
        } catch (e) {
            // Ignore table missing errors
        }

        // 2. Query existing voice_sessions table
        try {
            const monitoredChannelIds = Object.values(config.CLAN_VOICE_CHANNELS).map(c => c.id);
            // IST day start & end in UTC ISO strings
            const istStartIso = new Date(`${dateStr}T00:00:00+05:30`).toISOString();
            const istEndIso = new Date(`${dateStr}T23:59:59.999+05:30`).toISOString();

            const { data: vsData, error: vsError } = await supabase
                .from('voice_sessions')
                .select('*')
                .in('channel_id', monitoredChannelIds)
                .gte('session_date', istStartIso)
                .lte('session_date', istEndIso);

            if (!vsError && vsData && vsData.length > 0) {
                vsData.forEach(row => {
                    let clanName = config.getClanByChannelId(row.channel_id)?.name || 'UNKNOWN';
                    let durSec = (row.duration_minutes || 0) * 60;
                    let displayName = row.username || `user_${row.discord_user_id}`;
                    let sid = `vs_${row.id}`;

                    // Extract encoded metadata if present: Clan | dur:X | Name | sid:Y
                    if (row.channel_name && row.channel_name.includes('dur:')) {
                        const parts = row.channel_name.split('|').map(p => p.trim());
                        if (parts[0]) clanName = parts[0];
                        const durPart = parts.find(p => p.startsWith('dur:'));
                        if (durPart) {
                            const parsed = parseInt(durPart.replace('dur:', '').trim(), 10);
                            if (!isNaN(parsed) && parsed > 0) durSec = parsed;
                        }
                        const sidPart = parts.find(p => p.startsWith('sid:'));
                        if (sidPart) {
                            sid = sidPart.replace('sid:', '').trim();
                        }
                        if (parts.length >= 3 && !parts[2].startsWith('dur:') && !parts[2].startsWith('sid:')) {
                            displayName = parts[2];
                        }
                    }

                    if (!sessionMap.has(sid)) {
                        sessionMap.set(sid, {
                            sessionId: sid,
                            discordUserId: row.discord_user_id,
                            username: row.username || displayName,
                            displayName: displayName,
                            clanName: clanName,
                            guildId: config.MAIN_SERVER_ID,
                            voiceChannelId: row.channel_id,
                            joinTime: row.session_date,
                            leaveTime: row.session_date,
                            durationSeconds: durSec,
                            sessionDate: dateStr
                        });
                    }
                });
            }
        } catch (e) {
            console.warn('⚠️ [Voice Monitor DB] Error querying voice_sessions:', e.message);
        }
    }

    // 3. Merge with local file backup
    const local = loadLocalJson(LOCAL_SESSIONS_FILE, []);
    local
        .filter(s => s.sessionDate === dateStr)
        .forEach(s => {
            const sid = s.sessionId || `local_${s.discordUserId}_${s.joinTime}`;
            if (!sessionMap.has(sid)) {
                sessionMap.set(sid, {
                    ...s,
                    displayName: s.displayName || s.username || `user_${s.discordUserId}`,
                    clanName: s.clanName || (config.getClanByChannelId(s.voiceChannelId)?.name) || 'UNKNOWN'
                });
            }
        });

    return Array.from(sessionMap.values());
}

/**
 * Check if the 11 PM report for a specific date was already sent.
 */
async function hasReportBeenSent(dateStr) {
    if (isDbReady()) {
        const supabase = getSupabase();
        // Check daily_voice_report_logs if present
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
            // Ignore
        }

        // Check progress_reminder_logs
        try {
            const { data, error } = await supabase
                .from('progress_reminder_logs')
                .select('id, discord_user_id, reminder_sent')
                .eq('reminder_type', 'daily_voice_report')
                .eq('reminder_date', dateStr)
                .limit(1);

            if (!error && data && data.length > 0) {
                if (data[0].reminder_sent) return true;
                try {
                    const parsed = JSON.parse(data[0].discord_user_id);
                    if (parsed.status === 'sent') return true;
                } catch(e) {}
            }
        } catch (e) {
            // Ignore
        }
    }

    const reports = loadLocalJson(LOCAL_REPORTS_FILE, []);
    return reports.some(r => r.reportDate === dateStr && r.status !== 'failed');
}

/**
 * Mark 11 PM report in database.
 * Stores structured report details, status (pending, sent, failed),
 * message ID, and individual member-level clan activity records.
 */
async function markReportSent(dateStr, stats = {}) {
    const reportStatus = stats.status || 'sent';
    const reportChannelId = stats.reportChannelId || config.REPORT_CHANNEL_ID;
    const reportMessageId = stats.reportMessageId || null;
    const activeMembersCount = stats.activeMembersCount || 0;
    const totalSeconds = stats.totalSeconds || 0;
    const totalSessionsCount = stats.totalSessionsCount || 0;
    const clanBreakdown = stats.clanBreakdown || [];

    // 1. Local backup
    const reports = loadLocalJson(LOCAL_REPORTS_FILE, []);
    const existingIdx = reports.findIndex(r => r.reportDate === dateStr);
    const reportObj = {
        reportDate: dateStr,
        sentAt: new Date().toISOString(),
        status: reportStatus,
        reportChannelId,
        reportMessageId,
        activeMembersCount,
        totalSeconds,
        totalSessionsCount,
        clanBreakdown
    };

    if (existingIdx >= 0) {
        reports[existingIdx] = { ...reports[existingIdx], ...reportObj };
    } else {
        reports.push(reportObj);
    }
    saveLocalJson(LOCAL_REPORTS_FILE, reports);

    // 2. Supabase persistence
    if (isDbReady()) {
        const supabase = getSupabase();

        // 2a. Save to daily_voice_report_logs if present
        try {
            await supabase
                .from('daily_voice_report_logs')
                .upsert({
                    report_date: dateStr,
                    sent_at: new Date().toISOString(),
                    active_members_count: activeMembersCount,
                    total_seconds: totalSeconds
                }, { onConflict: 'report_date' });
        } catch (e) {
            // Ignore table missing error
        }

        // 2b. Persist structured report summary in progress_reminder_logs
        try {
            const reportPayload = JSON.stringify({
                status: reportStatus,
                reportDate: dateStr,
                reportChannelId,
                reportMessageId,
                activeMembersCount,
                totalSeconds,
                totalSessionsCount,
                clanSummary: clanBreakdown.map(c => ({
                    clanName: c.clanName,
                    userId: c.userId,
                    displayName: c.displayName,
                    totalDuration: c.totalDuration,
                    sessionCount: c.sessionCount
                }))
            });

            const { data: existingLogs } = await supabase
                .from('progress_reminder_logs')
                .select('id')
                .eq('reminder_type', 'daily_voice_report')
                .eq('reminder_date', dateStr)
                .limit(1);

            if (existingLogs && existingLogs.length > 0) {
                await supabase
                    .from('progress_reminder_logs')
                    .update({
                        community_progress_channel_id: reportChannelId,
                        discord_user_id: reportPayload,
                        reminder_sent: (reportStatus === 'sent'),
                        progress_submitted: true,
                        reminder_time: new Date().toISOString()
                    })
                    .eq('id', existingLogs[0].id);
            } else {
                await supabase
                    .from('progress_reminder_logs')
                    .insert([{
                        community_progress_channel_id: reportChannelId,
                        discord_user_id: reportPayload,
                        reminder_type: 'daily_voice_report',
                        reminder_date: dateStr,
                        reminder_sent: (reportStatus === 'sent'),
                        progress_submitted: true,
                        reminder_time: new Date().toISOString()
                    }]);
            }
            console.log(`[Voice Monitor DB] Persisted daily voice report record for ${dateStr} (status: ${reportStatus})`);
        } catch (e) {
            console.warn('⚠️ [Voice Monitor DB] progress_reminder_logs report save exception:', e.message);
        }

        // 2c. Persist member-level clan activity records
        if (Array.isArray(clanBreakdown) && clanBreakdown.length > 0) {
            for (const member of clanBreakdown) {
                try {
                    const reminderType = `clan_voice:${member.clanName}`;
                    const { data: mExisting } = await supabase
                        .from('progress_reminder_logs')
                        .select('id')
                        .eq('reminder_type', reminderType)
                        .eq('reminder_date', dateStr)
                        .eq('discord_user_id', member.userId)
                        .limit(1);

                    const memberPayload = JSON.stringify({
                        clanName: member.clanName,
                        displayName: member.displayName,
                        totalDuration: member.totalDuration,
                        sessionCount: member.sessionCount
                    });

                    if (mExisting && mExisting.length > 0) {
                        await supabase
                            .from('progress_reminder_logs')
                            .update({
                                community_progress_channel_id: member.clanVoiceChannelId,
                                reminder_time: new Date().toISOString(),
                                progress_submitted: true,
                                reminder_sent: true
                            })
                            .eq('id', mExisting[0].id);
                    } else {
                        await supabase
                            .from('progress_reminder_logs')
                            .insert([{
                                community_progress_channel_id: member.clanVoiceChannelId,
                                discord_user_id: member.userId,
                                reminder_type: reminderType,
                                reminder_date: dateStr,
                                progress_submitted: true,
                                reminder_sent: true,
                                reminder_time: new Date().toISOString()
                            }]);
                    }
                } catch (err) {
                    console.warn(`⚠️ [Voice Monitor DB] Could not persist member stat for ${member.userId}:`, err.message);
                }
            }
            console.log(`[Voice Monitor DB] Persisted ${clanBreakdown.length} member clan voice records to database for ${dateStr}`);
        }
    }

    return reportObj;
}

/**
 * Get historical report for a specific date
 */
async function getReportForDate(dateStr) {
    if (isDbReady()) {
        const supabase = getSupabase();
        try {
            const { data } = await supabase
                .from('progress_reminder_logs')
                .select('*')
                .eq('reminder_type', 'daily_voice_report')
                .eq('reminder_date', dateStr)
                .limit(1);

            if (data && data.length > 0) {
                try {
                    return JSON.parse(data[0].discord_user_id);
                } catch(e) {}
            }
        } catch (e) {}
    }

    const reports = loadLocalJson(LOCAL_REPORTS_FILE, []);
    return reports.find(r => r.reportDate === dateStr) || null;
}

module.exports = {
    saveVoiceSession,
    getSessionsForDate,
    hasReportBeenSent,
    markReportSent,
    getReportForDate,
    saveActiveSessions,
    loadActiveSessions,
    removeActiveSession
};
