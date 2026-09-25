const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const db = require('./db');
const tracker = require('./tracker');

let cronJob = null;

/**
 * Format duration seconds into human readable "Xh Ym" or "Ym"
 */
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0m';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) {
        return mins > 0 ? `${hrs}h ${String(mins).padStart(2, '0')}m` : `${hrs}h`;
    }
    if (mins === 0) return '< 1m';
    return `${mins}m`;
}

/**
 * Get IST Date string (YYYY-MM-DD) and Display Date (DD Month YYYY)
 */
function getISTDateInfo() {
    const now = new Date();
    const isoDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: config.TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(now);

    const displayDate = new Intl.DateTimeFormat('en-GB', {
        timeZone: config.TIMEZONE,
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(now);

    return { isoDate, displayDate };
}

/**
 * Build Embed Content for Daily 4-Clan Voice Activity Report
 */
function buildReportEmbed(displayDate, combinedSessions) {
    const medals = ['🥇', '🥈', '🥉'];

    // 1. Calculate Overall Voice Statistics (across all 4 clan voice channels)
    const overallStats = new Map(); // userId -> { displayName, username, totalSeconds, sessionCount }

    combinedSessions.forEach(s => {
        const uid = s.discordUserId;
        if (!overallStats.has(uid)) {
            overallStats.set(uid, {
                displayName: s.displayName || s.username || `user_${uid}`,
                username: s.username || `user_${uid}`,
                totalSeconds: 0,
                sessionCount: 0
            });
        }
        const stat = overallStats.get(uid);
        stat.totalSeconds += (s.durationSeconds || 0);
        stat.sessionCount += 1;
    });

    const overallList = Array.from(overallStats.values())
        .filter(m => m.totalSeconds > 0)
        .sort((a, b) => b.totalSeconds - a.totalSeconds);

    const activeMembersCount = overallList.length;
    const totalVoiceSeconds = overallList.reduce((acc, m) => acc + m.totalSeconds, 0);
    const totalSessionsCount = combinedSessions.length;

    let overallLeaderboardText = '';
    if (overallList.length === 0) {
        overallLeaderboardText = '*No voice activity recorded today.*';
    } else {
        overallLeaderboardText = overallList.map((m, idx) => {
            const icon = medals[idx] || `**#${idx + 1}**`;
            return `${icon} **${m.displayName || m.username}** — ${formatDuration(m.totalSeconds)}`;
        }).join('\n');
    }

    // 2. Calculate Clan-specific Voice Statistics for each of the 4 clans
    const clanSections = Object.values(config.CLAN_VOICE_CHANNELS).map(clan => {
        const clanSessions = combinedSessions.filter(s =>
            s.voiceChannelId === clan.id || s.clanName === clan.name
        );

        const clanUserStats = new Map();
        clanSessions.forEach(s => {
            const uid = s.discordUserId;
            if (!clanUserStats.has(uid)) {
                clanUserStats.set(uid, {
                    displayName: s.displayName || s.username || `user_${uid}`,
                    username: s.username || `user_${uid}`,
                    totalSeconds: 0,
                    sessionCount: 0
                });
            }
            const stat = clanUserStats.get(uid);
            stat.totalSeconds += (s.durationSeconds || 0);
            stat.sessionCount += 1;
        });

        const clanMembers = Array.from(clanUserStats.values())
            .filter(m => m.totalSeconds > 0)
            .sort((a, b) => b.totalSeconds - a.totalSeconds);

        let clanBody = '';
        if (clanMembers.length === 0) {
            clanBody = '*No voice activity recorded.*';
        } else {
            clanBody = clanMembers.map((m, idx) => {
                const icon = medals[idx] || `**#${idx + 1}**`;
                return `${icon} **${m.displayName || m.username}** — ${formatDuration(m.totalSeconds)}`;
            }).join('\n');
        }

        return `${clan.emoji} **${clan.name}**\n\n${clanBody}`;
    }).join('\n\n');

    // 3. Assemble Full Report Description matching specifications
    const description =
        `📅 **${displayDate}**\n\n` +
        `🎙️ **Voice Channel Activity**\n\n` +
        `${overallLeaderboardText}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `👥 **Active Members:** ${activeMembersCount}\n` +
        `⏱️ **Total Voice Time:** ${formatDuration(totalVoiceSeconds)}\n` +
        `🎙️ **Total Sessions:** ${totalSessionsCount}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `🎙️ **CLAN VOICE ACTIVITY**\n\n` +
        `${clanSections}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `🕚 **Report Time:** 11:00 PM IST`;

    const embed = new EmbedBuilder()
        .setTitle('📊 DAILY VOICE ACTIVITY')
        .setDescription(description)
        .setColor(0x00f2fe)
        .setTimestamp();

    return {
        embed,
        activeMembersCount,
        totalVoiceSeconds,
        totalSessionsCount
    };
}

/**
 * Generate and Post Daily 11 PM Voice Activity Report
 */
async function generateAndSendDailyReport(client) {
    console.log('⏰ [DailyVoiceReport] Generating Daily Voice Activity Report...');
    try {
        const { isoDate, displayDate } = getISTDateInfo();

        // 1. Check if report was already sent today (Deduplication)
        const alreadySent = await db.hasReportBeenSent(isoDate);
        if (alreadySent) {
            console.log(`ℹ️ [DailyVoiceReport] Report for ${isoDate} already sent. Skipping duplicate.`);
            return false;
        }

        // 2. Finalize Day Boundary at 11:00 PM IST
        const now = Date.now();
        await tracker.finalizeDayBoundary(now);

        // 3. Fetch completed sessions for today
        const dbSessions = await db.getSessionsForDate(isoDate);
        const combinedSessions = [...dbSessions];

        // 4. Build Report Embed
        const { embed, activeMembersCount, totalVoiceSeconds } = buildReportEmbed(displayDate, combinedSessions);

        // 5. Strict Destination Validation: Send ONLY to AURA Server Status Channel
        const clanServerId = config.CLAN_SERVER_ID;
        const mainServerId = config.MAIN_SERVER_ID;
        const reportChannelId = config.REPORT_CHANNEL_ID;

        const channel = await client.channels.fetch(reportChannelId).catch(() => null);
        if (!channel) {
            console.error(`❌ [DailyVoiceReport] Could not fetch report channel ${reportChannelId}`);
            return false;
        }

        // Security check: Never send report to Main Server
        if (channel.guild && channel.guild.id === mainServerId) {
            console.error(`❌ [DailyVoiceReport] Security Alert: Report channel ${reportChannelId} is located in Main Server ${mainServerId}! Aborting send.`);
            return false;
        }

        // Security check: Verify channel is in AURA / Clan Server
        if (channel.guild && channel.guild.id !== clanServerId) {
            console.error(`❌ [DailyVoiceReport] Security Alert: Report channel ${reportChannelId} is in guild ${channel.guild.id}, expected Clan Server ${clanServerId}`);
            return false;
        }

        // 6. Post Report to AURA Server
        await channel.send({ embeds: [embed] });
        console.log(`✅ [DailyVoiceReport] Report sent successfully to AURA Server channel ${reportChannelId} for ${isoDate}`);

        // 7. Mark report sent in database
        await db.markReportSent(isoDate, {
            activeMembersCount,
            totalSeconds: totalVoiceSeconds
        });

        return true;
    } catch (err) {
        console.error('❌ [DailyVoiceReport] Error generating daily report:', err);
        return false;
    }
}

/**
 * Start cron scheduler for 11:00 PM IST
 */
function startScheduler(client) {
    if (cronJob) cronJob.stop();

    console.log(`⏰ [Voice Monitor Scheduler] Registering 11 PM cron schedule "${config.CRON_SCHEDULE}" (${config.TIMEZONE})...`);
    cronJob = cron.schedule(config.CRON_SCHEDULE, async () => {
        await generateAndSendDailyReport(client);
    }, {
        scheduled: true,
        timezone: config.TIMEZONE
    });
}

module.exports = {
    startScheduler,
    generateAndSendDailyReport,
    buildReportEmbed,
    formatDuration,
    getISTDateInfo
};
