const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const db = require('./db');
const questions = require('./questions');

let scheduledCronTask = null;

async function postDailyChallenge(client) {
    console.log('🤖 [Programming Challenge] Posting daily challenge...');
    try {
        const channelId = config.channelId || process.env.PROGRAMMING_CHANNEL_ID;
        if (!channelId) {
            console.warn('⚠️ [Programming Challenge] PROGRAMMING_CHANNEL_ID is not configured.');
            return null;
        }

        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) {
            console.warn(`⚠️ [Programming Challenge] Channel ${channelId} could not be fetched.`);
            return null;
        }

        // Pick random question
        const activeCurrent = await db.getActiveChallenge();
        const excludeId = activeCurrent ? [activeCurrent.id] : [];
        const question = questions.getRandomQuestion(excludeId);

        const newActive = {
            ...question,
            postedAt: new Date().toISOString(),
            solves: [],
            firstSolverId: null,
            fastestSolverId: null,
            fastestTimeMs: null
        };

        await db.setActiveChallenge(newActive);

        const diffColors = {
            Easy: 0x2ecc71,   // Green
            Medium: 0xf1c40f, // Yellow
            Hard: 0xe74c3c    // Red
        };

        const sampleTC = newActive.testCases && newActive.testCases.length > 0 ? newActive.testCases[0] : null;
        const sampleInput = sampleTC ? JSON.stringify(sampleTC.input) : 'N/A';
        const sampleExpected = sampleTC ? JSON.stringify(sampleTC.expected) : 'N/A';

        const embed = new EmbedBuilder()
            .setTitle('🔥 Daily Programming Challenge')
            .setColor(diffColors[newActive.difficulty] || 0x3498db)
            .addFields(
                { name: '📌 Title', value: `**${newActive.title}**`, inline: false },
                { name: '📝 Problem', value: newActive.description, inline: false },
                { name: '📥 Sample Input', value: `\`\`\`json\n${sampleInput}\n\`\`\``, inline: true },
                { name: '📤 Sample Expected Output', value: `\`\`\`json\n${sampleExpected}\n\`\`\``, inline: true },
                { name: '📊 Difficulty', value: `\`${newActive.difficulty}\``, inline: true },
                { name: '🏷️ Category', value: `\`${newActive.category}\``, inline: true },
                { name: '⭐ Rewards', value: `\`+${config.xpRewards[newActive.difficulty]} XP\` | \`+${config.communityPointsReward} Community Points\``, inline: false },
                { name: '💻 Supported Languages', value: '`/python`  `/java`  `/csharp`  `/javascript`  `/cpp`  `/c`', inline: false },
                { name: '🕗 Deadline', value: 'Before tomorrow\'s 8:00 AM challenge.', inline: false }
            )
            .setFooter({ text: 'Good luck everyone! 🚀' })
            .setTimestamp();

        // Mention @everyone ONLY ONCE when posting the new daily challenge
        const message = await channel.send({
            content: '@everyone',
            embeds: [embed]
        });

        console.log(`✅ [Programming Challenge] Posted challenge "${newActive.title}" (ID: ${newActive.id}) with @everyone ping.`);
        return message;
    } catch (err) {
        console.error('❌ [Programming Challenge] Error posting daily challenge:', err);
        return null;
    }
}

function startScheduler(client) {
    if (scheduledCronTask) {
        scheduledCronTask.stop();
    }

    const scheduleStr = config.cronSchedule; // '0 8 * * *'
    console.log(`⏰ [Programming Challenge] Scheduling daily challenge cron at "${scheduleStr}" (${config.timezone})`);

    scheduledCronTask = cron.schedule(scheduleStr, async () => {
        await postDailyChallenge(client);
    }, {
        scheduled: true,
        timezone: config.timezone
    });
}

module.exports = {
    startScheduler,
    postDailyChallenge
};
