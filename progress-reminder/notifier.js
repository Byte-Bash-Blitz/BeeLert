const state = require('./state');

// Helper to check safety rules before writing to the clan reminder channel
async function getValidatedClanChannel(client, pair) {
    try {
        const clanChannel = await client.channels.fetch(pair.clanReminderChannelId);
        if (!clanChannel || !clanChannel.isTextBased()) {
            console.error(`❌ [Progress Reminder] Clan reminder channel (${pair.clanReminderChannelId}) not found or is not text-based.`);
            return null;
        }

        const clanGuildId = clanChannel.guildId || (clanChannel.guild ? clanChannel.guild.id : null);
        
        // Safety Guardrail: Never write to the community server
        if (clanGuildId === pair.communityServerId) {
            console.error(`❌ [SAFETY CHECK FAILED] Blocked write attempt! Clan reminder channel (${pair.clanReminderChannelId}) is located in the community server (${pair.communityServerId}). Community server must be strictly read-only.`);
            return null;
        }

        // Safety Guardrail: Clan reminder channel must not be the community progress channel
        if (pair.clanReminderChannelId === pair.communityProgressChannelId) {
            console.error(`❌ [SAFETY CHECK FAILED] Blocked write attempt! Clan reminder channel ID matches the Community progress channel ID.`);
            return null;
        }

        return clanChannel;
    } catch (error) {
        console.error(`❌ [Progress Reminder] Error fetching or validating clan channel:`, error.message);
        return null;
    }
}

// 1. FIRST REMINDER: 9:00 PM (Automatic Direct DMs to missing tracked members)
async function runFirstReminder(client, pair, index) {
    const channelId = pair.communityProgressChannelId;
    const trackedMembers = pair.trackedMembers;
    if (!trackedMembers || trackedMembers.length === 0) return;

    console.log(`🚀 [Progress Reminder] Running 9:00 PM DM reminder check for pair ${index + 1}...`);
    
    try {
        // Fetch users who posted today
        const postedUsers = await state.getPostedMembersToday(channelId, trackedMembers);
        
        // Find users who have NOT posted
        const unsubmittedMembers = trackedMembers.filter(userId => !postedUsers.has(userId));
        
        if (unsubmittedMembers.length === 0) {
            console.log(`✅ [Progress Reminder] All tracked members have submitted progress for pair ${index + 1}. No 9:00 PM DMs needed.`);
            return;
        }

        for (const userId of unsubmittedMembers) {
            try {
                // Check if already sent 9:00 PM reminder today
                const alreadyReminded = await state.isReminded(channelId, userId, 'first');
                if (alreadyReminded) {
                    console.log(`ℹ️ [Progress Reminder] User ${userId} already received 9:00 PM DM today. Skipping.`);
                    continue;
                }

                console.log(`✉️ [Progress Reminder] Sending 9:00 PM DM to user: ${userId}`);
                const user = await client.users.fetch(userId);
                if (user) {
                    const dmText = 
                        `Hello! 👋\n\n` +
                        `You haven't posted your daily progress today.\n\n` +
                        `Please submit your progress in <#${channelId}>.\n\n` +
                        `Keep your streak alive! 🔥\n\n` +
                        `Thank you.`;

                    await user.send(dmText);
                    console.log(`✉️ [Progress Reminder] 9:00 PM DM successfully sent to user ${userId}`);
                }
                
                // Record in database/state that today's reminder has been sent
                await state.markReminded(channelId, userId, 'first');
            } catch (dmError) {
                console.warn(`⚠️ [Progress Reminder] Failed to send 9:00 PM DM to user ${userId} (DMs disabled/error): ${dmError.message}`);
                // Record in state anyway to prevent infinite retry loops
                await state.markReminded(channelId, userId, 'first');
            }
        }
    } catch (error) {
        console.error(`❌ [Progress Reminder] Error running 9:00 PM DM reminders for pair ${index + 1}:`, error.message);
    }
}

// 2. SECOND REMINDER: 11:00 PM (Private DMs)
async function runSecondReminder(client, pair, index) {
    const channelId = pair.communityProgressChannelId;
    const trackedMembers = pair.trackedMembers;
    if (!trackedMembers || trackedMembers.length === 0) return;

    console.log(`🚀 [Progress Reminder] Running 11:00 PM second reminder check for pair ${index + 1}...`);

    try {
        const postedUsers = await state.getPostedMembersToday(channelId, trackedMembers);
        const unsubmittedMembers = trackedMembers.filter(userId => !postedUsers.has(userId));

        for (const userId of unsubmittedMembers) {
            try {
                // Check if already sent second reminder today
                const alreadyReminded = await state.isReminded(channelId, userId, 'second');
                if (alreadyReminded) continue;

                console.log(`✉️ [Progress Reminder] Sending 11:00 PM private DM to user: ${userId}`);
                const user = await client.users.fetch(userId);
                if (user) {
                    const dmText = 
                        `Hello! 👋\n\n` +
                        `You haven't posted your daily progress today.\n\n` +
                        `Please submit your progress in <#${channelId}>.\n\n` +
                        `Keep your streak alive! 🔥\n\n` +
                        `Thank you.`;

                    await user.send(dmText);
                    console.log(`✉️ [Progress Reminder] 11:00 PM DM successfully sent to user ${userId}`);
                }
                
                // Log second reminder
                await state.markReminded(channelId, userId, 'second');
            } catch (error) {
                console.warn(`⚠️ [Progress Reminder] Failed to send 11:00 PM DM to user ${userId} (DMs might be disabled): ${error.message}`);
                // Mark as reminded anyway to prevent endless retries
                await state.markReminded(channelId, userId, 'second');
            }
        }
    } catch (error) {
        console.error(`❌ [Progress Reminder] Error running 11:00 PM DM reminders for pair ${index + 1}:`, error.message);
    }
}

// 3. INACTIVE MEMBER ALERT: 10:00 AM (Next Day Inactivity Alert)
async function runInactiveAlert(client, pair, index) {
    const channelId = pair.communityProgressChannelId;
    const trackedMembers = pair.trackedMembers;
    if (!trackedMembers || trackedMembers.length === 0) return;

    console.log(`🚀 [Progress Reminder] Running 10:00 AM inactive member alert check for pair ${index + 1}...`);

    try {
        // Calculate consecutive inactive members from DB (checks yesterday & day before)
        const inactiveMembers = await state.getInactiveMembers(trackedMembers);

        if (inactiveMembers.length === 0) {
            console.log(`✅ [Progress Reminder] No inactive members (2 consecutive days missed) found for pair ${index + 1}.`);
            return;
        }

        // Filter out users who already had an inactive alert sent today
        const membersToAlert = [];
        for (const userId of inactiveMembers) {
            const alreadyAlerted = await state.isReminded(channelId, userId, 'inactive');
            if (!alreadyAlerted) {
                membersToAlert.push(userId);
            }
        }

        if (membersToAlert.length === 0) {
            console.log(`ℹ️ [Progress Reminder] Inactive member alerts already sent today for all inactive members in pair ${index + 1}.`);
            return;
        }

        // Send alert to clan reminder channel
        const clanChannel = await getValidatedClanChannel(client, pair);
        if (clanChannel) {
            const mentionsStr = membersToAlert.map(id => `<@${id}>`).join('\n');
            const messageText = 
                `⚠️ **Inactive Member Alert**\n\n` +
                `These members have missed their daily progress for 2 consecutive days.\n\n` +
                `${mentionsStr}\n\n` +
                `Please check in with them.`;

            await clanChannel.send(messageText);
            console.log(`📢 [Progress Reminder] Posted consolidated 10:00 AM inactive alert in channel ${pair.clanReminderChannelId} for ${membersToAlert.length} users.`);

            // Log inactive alert in state/database for these users
            for (const userId of membersToAlert) {
                await state.markReminded(channelId, userId, 'inactive');
            }
        }
    } catch (error) {
        console.error(`❌ [Progress Reminder] Error running 10:00 AM inactive alert for pair ${index + 1}:`, error.message);
    }
}

module.exports = {
    runFirstReminder,
    runSecondReminder,
    runInactiveAlert
};
