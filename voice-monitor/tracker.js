const config = require('./config');
const db = require('./db');

// In-memory active session map: discordUserId -> sessionData
const activeSessions = new Map();

/**
 * Get IST Date YYYY-MM-DD
 */
function getTodayISTDate(dateObj = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: config.TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(dateObj);
}

/**
 * Extract display name and username fallback
 */
function getMemberNames(member, userId) {
    if (!member) {
        return {
            displayName: `user_${userId}`,
            username: `user_${userId}`
        };
    }
    const username = (member.user && member.user.username) ? member.user.username : (member.displayName || `user_${userId}`);
    const displayName = member.displayName || (member.user && member.user.displayName) || username;
    return { displayName, username };
}

/**
 * Silent Voice State Event Handler
 * Monitors strictly the 4 Clan Voice Channels:
 * AURA, BELMONT, LUMINA, SHADASTRIA
 */
async function handleVoiceStateUpdate(oldState, newState) {
    try {
        const userId = newState.id || oldState.id;
        const oldChannelId = oldState.channelId;
        const newChannelId = newState.channelId;

        // Ignore events where channel did not change (e.g. mute, deafen, screen share)
        if (oldChannelId === newChannelId) return;

        // Ignore bot users
        const isBot = (newState.member?.user?.bot) || (oldState.member?.user?.bot);
        if (isBot) return;

        const isOldMonitored = config.isMonitoredVc(oldChannelId);
        const isNewMonitored = config.isMonitoredVc(newChannelId);

        // Neither channel is monitored — nothing to track
        if (!isOldMonitored && !isNewMonitored) return;

        const now = Date.now();

        // Case 1: Member switched between tracked clan VCs (e.g. AURA -> BELMONT)
        if (isOldMonitored && isNewMonitored) {
            const oldClan = config.getClanByChannelId(oldChannelId)?.name || oldChannelId;
            const newClan = config.getClanByChannelId(newChannelId)?.name || newChannelId;
            console.log(`[VoiceTracking] ${oldClan} → ${newClan} movement for user ${userId}`);
            await handleMemberLeave(userId, oldState, now);
            await handleMemberJoin(userId, newState, now);
        }
        // Case 2: Member joined tracked clan VC (from disconnected or untracked VC)
        else if (!isOldMonitored && isNewMonitored) {
            await handleMemberJoin(userId, newState, now);
        }
        // Case 3: Member left tracked clan VC (disconnected or moved to untracked VC)
        else if (isOldMonitored && !isNewMonitored) {
            await handleMemberLeave(userId, oldState, now);
        }
    } catch (err) {
        console.error('❌ [Voice Monitor Tracker] Error in handleVoiceStateUpdate:', err.message);
    }
}

/**
 * Member Join Tracked Clan VC
 */
async function handleMemberJoin(userId, state, customNow = Date.now()) {
    const member = state.member;
    if (member?.user?.bot) return;

    const { displayName, username } = getMemberNames(member, userId);
    const guildId = state.guild ? state.guild.id : config.MAIN_SERVER_ID;
    const channelId = state.channelId;
    const clanInfo = config.getClanByChannelId(channelId);
    const clanName = clanInfo ? clanInfo.name : 'UNKNOWN';
    const now = customNow;
    const todayDate = getTodayISTDate(new Date(now));

    // If an active session already exists for this user, close and save it before starting new one
    if (activeSessions.has(userId)) {
        await handleMemberLeave(userId, state, now);
    }

    const sessionId = `vsession_${userId}_${channelId}_${now}`;
    const sessionData = {
        sessionId,
        discordUserId: userId,
        username,
        displayName,
        clanName,
        guildId,
        voiceChannelId: channelId,
        joinTime: now,
        sessionDate: todayDate
    };

    activeSessions.set(userId, sessionData);
    db.saveActiveSessions(activeSessions);

    console.log(`[VoiceTracking] ${clanName} member joined: ${displayName} (${username}) in ${channelId} (Silent)`);
}

/**
 * Member Leave Tracked Clan VC
 */
async function handleMemberLeave(userId, state, customNow = Date.now()) {
    const active = activeSessions.get(userId);
    const now = customNow;
    const todayDate = getTodayISTDate(new Date(now));

    let joinTime = now;
    let username = `user_${userId}`;
    let displayName = `user_${userId}`;
    let sessionId = `vsession_${userId}_${now}`;
    let channelId = state.channelId || config.MONITORED_VC_ID;
    let clanName = config.getClanByChannelId(channelId)?.name || 'UNKNOWN';
    let guildId = state.guild ? state.guild.id : config.MAIN_SERVER_ID;
    let sessionDate = todayDate;

    if (active) {
        joinTime = active.joinTime;
        username = active.username;
        displayName = active.displayName;
        sessionId = active.sessionId;
        channelId = active.voiceChannelId || channelId;
        clanName = active.clanName || config.getClanByChannelId(channelId)?.name || clanName;
        guildId = active.guildId || guildId;
        sessionDate = active.sessionDate || todayDate;

        activeSessions.delete(userId);
        db.removeActiveSession(userId);
    } else {
        const member = state.member;
        if (member) {
            const names = getMemberNames(member, userId);
            displayName = names.displayName;
            username = names.username;
        }
    }

    const durationSeconds = Math.max(0, Math.floor((now - joinTime) / 1000));
    const sessionData = {
        sessionId,
        discordUserId: userId,
        username,
        displayName,
        clanName,
        guildId,
        voiceChannelId: channelId,
        joinTime,
        leaveTime: now,
        durationSeconds,
        sessionDate
    };

    await db.saveVoiceSession(sessionData);
    console.log(`[VoiceTracking] ${clanName} member left: ${displayName} (${username}). Duration: ${durationSeconds}s (${Math.floor(durationSeconds / 60)}m) (Saved to DB)`);
}

/**
 * Bot Startup Recovery: Detect members currently connected to all 4 clan VCs
 * Restores original join times from persistent storage to avoid data loss on restart
 */
async function initStartupRecovery(client) {
    try {
        console.log(`🔍 [Voice Monitor] Checking startup recovery across all 4 Clan VCs...`);
        const persistedList = db.loadActiveSessions();
        const persistedMap = new Map(persistedList.map(s => [s.discordUserId, s]));
        const now = Date.now();
        const todayDate = getTodayISTDate(new Date(now));
        const activeUserIdsInChannels = new Set();

        for (const [clanKey, clanInfo] of Object.entries(config.CLAN_VOICE_CHANNELS)) {
            const channel = await client.channels.fetch(clanInfo.id).catch(() => null);
            if (!channel || !channel.isVoiceBased()) {
                console.warn(`⚠️ [Voice Monitor] Could not fetch VC ${clanInfo.name} (${clanInfo.id})`);
                continue;
            }

            const members = channel.members;
            members.forEach(member => {
                if (member.user && member.user.bot) return; // Ignore bots
                const userId = member.id;
                activeUserIdsInChannels.add(userId);

                const { displayName, username } = getMemberNames(member, userId);
                const persisted = persistedMap.get(userId);

                // If user was recorded in persistent active sessions for this channel, preserve original joinTime
                const joinTime = (persisted && persisted.voiceChannelId === clanInfo.id && persisted.joinTime)
                    ? Number(persisted.joinTime)
                    : now;

                const sessionId = (persisted && persisted.voiceChannelId === clanInfo.id && persisted.sessionId)
                    ? persisted.sessionId
                    : `vsession_${userId}_${clanInfo.id}_${now}`;

                activeSessions.set(userId, {
                    sessionId,
                    discordUserId: userId,
                    username,
                    displayName,
                    clanName: clanInfo.name,
                    guildId: channel.guild ? channel.guild.id : config.MAIN_SERVER_ID,
                    voiceChannelId: clanInfo.id,
                    joinTime,
                    sessionDate: todayDate
                });

                console.log(`🎙️ [Voice Monitor Recovery] Recovered active VC session for ${clanInfo.name}: ${displayName} (${username})`);
            });
        }

        // Close any sessions in persisted storage for members who are no longer connected
        for (const [persistedUserId, persistedSession] of persistedMap.entries()) {
            if (!activeUserIdsInChannels.has(persistedUserId)) {
                const leaveTime = now;
                const dur = Math.max(0, Math.floor((leaveTime - Number(persistedSession.joinTime || now)) / 1000));
                await db.saveVoiceSession({
                    ...persistedSession,
                    leaveTime,
                    durationSeconds: dur
                });
                db.removeActiveSession(persistedUserId);
                console.log(`🎙️ [Voice Monitor Recovery] Closed leftover session for disconnected member ${persistedSession.displayName || persistedSession.username} (${persistedUserId})`);
            }
        }

        db.saveActiveSessions(activeSessions);
    } catch (err) {
        console.error('❌ [Voice Monitor Recovery] Error:', err.message);
    }
}

/**
 * Finalize active sessions at 11:00 PM IST day boundary.
 * Closes the today segment of active sessions and rolls over into the next day cycle.
 */
async function finalizeDayBoundary(boundaryTime = Date.now()) {
    try {
        const todayDate = getTodayISTDate(new Date(boundaryTime));
        const nextDayDate = getTodayISTDate(new Date(boundaryTime + 1000));

        for (const [userId, active] of activeSessions.entries()) {
            const joinTime = Number(active.joinTime);
            const durationSeconds = Math.max(0, Math.floor((boundaryTime - joinTime) / 1000));

            // Save completed session for today up to 11:00 PM boundary
            await db.saveVoiceSession({
                sessionId: active.sessionId,
                discordUserId: userId,
                username: active.username,
                displayName: active.displayName,
                clanName: active.clanName,
                guildId: active.guildId,
                voiceChannelId: active.voiceChannelId,
                joinTime,
                leaveTime: boundaryTime,
                durationSeconds,
                sessionDate: active.sessionDate || todayDate
            });

            // Rollover active session for the next day starting at 11:00 PM
            const nextSessionId = `vsession_${userId}_${active.voiceChannelId}_${boundaryTime}`;
            activeSessions.set(userId, {
                ...active,
                sessionId: nextSessionId,
                joinTime: boundaryTime,
                sessionDate: nextDayDate
            });
        }

        db.saveActiveSessions(activeSessions);
        console.log(`⏰ [Voice Monitor Tracker] Rolled over ${activeSessions.size} active sessions at 11 PM IST boundary.`);
    } catch (err) {
        console.error('❌ [Voice Monitor Tracker] Error in finalizeDayBoundary:', err.message);
    }
}

/**
 * Get map of currently active connected sessions
 */
function getActiveSessions() {
    return activeSessions;
}

module.exports = {
    handleVoiceStateUpdate,
    initStartupRecovery,
    finalizeDayBoundary,
    getActiveSessions,
    getTodayISTDate,
    getMemberNames
};
