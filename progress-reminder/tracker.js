const config = require('./config');
const state = require('./state');

function getTodayMDYStrings() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const year = now.getFullYear();
    
    // Return both unpadded (e.g. 7/24/2026) and padded (e.g. 07/24/2026) formats
    const str1 = `${month}/${day}/${year}`;
    const str2 = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    return [str1, str2];
}

function isBotProgressAppreciation(message) {
    if (!message.author.bot) return false;
    
    const content = message.content || '';
    // Check if the message contains the progress appreciation keywords
    if (!content.includes('Appreciation for updating your daily progress') || !content.includes('awarded')) {
        return false;
    }
    
    // Check if the message references today's date
    const dates = getTodayMDYStrings();
    const hasTodayDate = dates.some(d => content.includes(d));
    if (!hasTodayDate) {
        return false;
    }
    
    return true;
}

async function loadTodayProgressForPair(client, pair, index) {
    const channelId = pair.communityProgressChannelId;
    if (!channelId) {
        console.warn(`⚠️ [Progress Reminder] Community progress channel ID is missing for pair ${index + 1}.`);
        return;
    }

    const trackedMembers = pair.trackedMembers;
    if (!trackedMembers || trackedMembers.length === 0) {
        console.log(`ℹ️ [Progress Reminder] No tracked members configured for pair ${index + 1}. Skipping scan.`);
        return;
    }

    console.log(`🔍 [Progress Reminder] Scanning today's messages for progress channel ${channelId} (Pair ${index + 1})...`);
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.error(`❌ [Progress Reminder] Community progress channel (${channelId}) not found.`);
            return;
        }

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartMs = todayStart.getTime();

        // Helper function to scan messages in a text channel or thread
        const scanChannelMessages = async (targetChannel) => {
            let lastId = null;
            let keepFetching = true;
            let count = 0;

            while (keepFetching) {
                const options = { limit: 100 };
                if (lastId) {
                    options.before = lastId;
                }
                
                const messages = await targetChannel.messages.fetch(options);
                if (messages.size === 0) {
                    break;
                }

                for (const message of messages.values()) {
                    if (message.createdTimestamp < todayStartMs) {
                        keepFetching = false;
                        break;
                    }
                    
                    // Case 1: Direct post by tracked user
                    if (trackedMembers.includes(message.author.id)) {
                        state.markPosted(channelId, message.author.id);
                        count++;
                    } 
                    // Case 2: Progress appreciation post by another bot (BashEye)
                    else if (isBotProgressAppreciation(message)) {
                        let targetUserId = null;
                        
                        // Try A: Check mentioned users in the bot reply
                        const mentionedUser = message.mentions.users.find(u => trackedMembers.includes(u.id));
                        if (mentionedUser) {
                            targetUserId = mentionedUser.id;
                        }
                        
                        // Try B: If in a thread, check the owner of the thread
                        if (!targetUserId && targetChannel.isThread() && targetChannel.ownerId) {
                            if (trackedMembers.includes(targetChannel.ownerId)) {
                                targetUserId = targetChannel.ownerId;
                            }
                        }
                        
                        // Try C: Check the author of the referenced message (the message the bot replied to)
                        if (!targetUserId && message.reference && message.reference.messageId) {
                            try {
                                const refMsg = await targetChannel.messages.fetch(message.reference.messageId);
                                if (refMsg && trackedMembers.includes(refMsg.author.id)) {
                                    targetUserId = refMsg.author.id;
                                }
                            } catch (err) {
                                // silent catch for fetch errors
                            }
                        }
                        
                        if (targetUserId) {
                            state.markPosted(channelId, targetUserId);
                            count++;
                        }
                    }
                }

                lastId = messages.lastKey();
            }
            return count;
        };

        let totalMatched = 0;

        // Check if it's a Forum Channel (Type 15 is GuildForum) or contains threads
        if (channel.type === 15 || channel.threads) {
            console.log(`📂 [Progress Reminder] Channel ${channelId} is a Forum channel. Fetching active threads...`);
            const activeThreads = await channel.threads.fetchActive();
            
            for (const thread of activeThreads.threads.values()) {
                const matchCount = await scanChannelMessages(thread);
                totalMatched += matchCount;
            }
            
            // Also fetch recently archived threads in case they were active earlier today
            try {
                const archivedThreads = await channel.threads.fetchArchived({ limit: 100 });
                for (const thread of archivedThreads.threads.values()) {
                    // Only scan if the thread was active/created today
                    if (thread.archiveTimestamp >= todayStartMs) {
                        const matchCount = await scanChannelMessages(thread);
                        totalMatched += matchCount;
                    }
                }
            } catch (archivedError) {
                console.warn(`⚠️ [Progress Reminder] Could not fetch archived threads for channel ${channelId}:`, archivedError.message);
            }

        } else if (channel.isTextBased()) {
            // Standard text channel
            totalMatched = await scanChannelMessages(channel);
        } else {
            console.error(`❌ [Progress Reminder] Channel ${channelId} is not a text or forum channel (Type: ${channel.type}).`);
        }

        const currentState = state.getCurrentState();
        const postedUsers = (currentState.channels[channelId] && currentState.channels[channelId].posted) || [];
        console.log(`✅ [Progress Reminder] Today's progress scan complete for channel ${channelId}. Match count: ${totalMatched}. Posted users: [${postedUsers.join(', ')}]`);
    } catch (error) {
        console.error(`❌ [Progress Reminder] Error scanning channel ${channelId}:`, error.message);
    }
}

async function loadTodayProgress(client) {
    if (!config.pairs || config.pairs.length === 0) {
        console.log('ℹ️ [Progress Reminder] No server pairs loaded. Skipping progress scan.');
        return;
    }

    for (let i = 0; i < config.pairs.length; i++) {
        await loadTodayProgressForPair(client, config.pairs[i], i);
    }
}

function registerMessageListener(client) {
    client.on('messageCreate', async (message) => {
        // Ignore bot messages unless they are appreciation replies
        if (message.author.bot) {
            const matchedPair = config.pairs.find(p => 
                p.communityProgressChannelId === message.channel.id || 
                p.communityProgressChannelId === message.channel.parentId
            );
            if (!matchedPair) return;

            if (isBotProgressAppreciation(message)) {
                let targetUserId = null;
                const trackedMembers = matchedPair.trackedMembers;
                
                // Try A: Mentions
                const mentionedUser = message.mentions.users.find(u => trackedMembers.includes(u.id));
                if (mentionedUser) {
                    targetUserId = mentionedUser.id;
                }
                
                // Try B: Thread Owner
                if (!targetUserId && message.channel.isThread() && message.channel.ownerId) {
                    if (trackedMembers.includes(message.channel.ownerId)) {
                        targetUserId = message.channel.ownerId;
                    }
                }
                
                // Try C: Referenced message
                if (!targetUserId && message.reference && message.reference.messageId) {
                    try {
                        const refMsg = await message.channel.messages.fetch(message.reference.messageId);
                        if (refMsg && trackedMembers.includes(refMsg.author.id)) {
                            targetUserId = refMsg.author.id;
                        }
                    } catch (err) {}
                }
                
                if (targetUserId) {
                    console.log(`📝 [Progress Reminder] Detected progress appreciation reply in channel ${message.channel.id} for user ${targetUserId}`);
                    state.markPosted(matchedPair.communityProgressChannelId, targetUserId);
                }
            }
            return;
        }

        // Direct user message
        const matchedPair = config.pairs.find(p => 
            p.communityProgressChannelId === message.channel.id || 
            p.communityProgressChannelId === message.channel.parentId
        );
        if (!matchedPair) return;

        if (matchedPair.trackedMembers.includes(message.author.id)) {
            console.log(`📝 [Progress Reminder] Detected progress post in channel ${message.channel.id} from tracked user ${message.author.username} (${message.author.id})`);
            state.markPosted(matchedPair.communityProgressChannelId, message.author.id);
        }
    });
}

module.exports = {
    loadTodayProgress,
    registerMessageListener
};
