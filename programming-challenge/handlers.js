const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('./config');
const db = require('./db');
const questions = require('./questions');
const evaluator = require('./evaluator');
const antiCheat = require('./antiCheat');
const scheduler = require('./scheduler');

/**
 * Checks and awards unlocked badges to user profile.
 */
function checkBadges(profile) {
    const newlyUnlocked = [];
    const existing = new Set(profile.badges || []);

    const award = (badgeKey) => {
        const badge = config.badges[badgeKey];
        if (badge && !existing.has(badge.id)) {
            profile.badges.push(badge.id);
            newlyUnlocked.push(badge);
        }
    };

    if (profile.solvedQuestions.length >= 1) award('FIRST_SOLVE');
    if (profile.currentStreak >= 7) award('STREAK_7');
    if (profile.currentStreak >= 30) award('STREAK_30');
    if (profile.solvedQuestions.length >= 100) award('SOLVES_100');
    if (profile.xp >= 500) award('XP_500');

    const pySolves = (profile.languageStats && profile.languageStats.python) || 0;
    if (pySolves >= 10) award('PYTHON_MASTER');

    const javaSolves = (profile.languageStats && profile.languageStats.java) || 0;
    if (javaSolves >= 10) award('JAVA_MASTER');

    const csSolves = (profile.languageStats && profile.languageStats.csharp) || 0;
    if (csSolves >= 10) award('CSHARP_MASTER');

    return newlyUnlocked;
}

/**
 * Processes code submission from user.
 */
async function processSubmission(userId, userTag, userAvatar, language, rawCode) {
    const active = await db.getActiveChallenge();
    if (!active) {
        return { error: '⚠️ No active daily programming challenge at the moment.' };
    }

    // Anti-cheat verification
    const acCheck = await antiCheat.checkAntiCheat(userId, active.id, rawCode);
    if (!acCheck.allowed) {
        return { error: acCheck.reason };
    }

    // Evaluate solution
    const evalResult = evaluator.evaluateCode(language, rawCode, active.testCases || []);
    const submittedAt = new Date();

    // Record submission history
    await db.recordSubmission({
        userId,
        challengeId: active.id,
        language,
        code: rawCode,
        isCorrect: evalResult.isCorrect,
        submittedAt: submittedAt.toISOString()
    });

    const profile = await db.getUserProfile(userId);
    profile.attempts = (profile.attempts || 0) + 1;

    if (!evalResult.isCorrect) {
        await db.saveUserProfile(profile);
        return {
            isCorrect: false,
            isError: evalResult.isError || false,
            errorType: evalResult.errorType,
            errorMessage: evalResult.errorMessage,
            hint: active.hint || evalResult.hint || 'Review your logic for boundary test cases.'
        };
    }

    // --- SUCCESS CASE ---
    const alreadyCompleted = (active.solves && active.solves.includes(userId)) || (profile.solvedQuestions && profile.solvedQuestions.includes(active.id));
    if (alreadyCompleted) {
        await db.saveUserProfile(profile);
        return {
            isCorrect: true,
            alreadyCompleted: true
        };
    }
    // Calculate streak
    const todayStr = submittedAt.toISOString().slice(0, 10);
    const lastDate = profile.lastSolvedDate ? new Date(profile.lastSolvedDate).toISOString().slice(0, 10) : null;

    let streakIncreased = false;
    if (lastDate !== todayStr) {
        const yesterday = new Date(submittedAt);
        yesterday.setDate(yesterday.getDate() - 1);
        const yestStr = yesterday.toISOString().slice(0, 10);

        if (lastDate === yestStr) {
            profile.currentStreak = (profile.currentStreak || 0) + 1;
        } else {
            profile.currentStreak = 1;
        }
        profile.highestStreak = Math.max(profile.highestStreak || 0, profile.currentStreak);
        profile.lastSolvedDate = submittedAt.toISOString();
        streakIncreased = true;
    }

    // Calculate XP
    const baseXP = config.xpRewards[active.difficulty] || 10;
    let earnedXP = baseXP;
    let bonusMessages = [];

    // First Solve Bonus
    if (!active.firstSolverId) {
        active.firstSolverId = userId;
        earnedXP += config.bonuses.firstSolve;
        bonusMessages.push(`⭐ **First Solve Bonus:** +${config.bonuses.firstSolve} XP`);
    }

    // Fastest Solve Bonus
    const postTime = active.postedAt ? new Date(active.postedAt).getTime() : submittedAt.getTime();
    const durationMs = submittedAt.getTime() - postTime;
    if (!active.fastestTimeMs || durationMs < active.fastestTimeMs) {
        active.fastestTimeMs = durationMs;
        active.fastestSolverId = userId;
        earnedXP += config.bonuses.fastestAnswer;
        bonusMessages.push(`⚡ **Fastest Solve Bonus:** +${config.bonuses.fastestAnswer} XP`);
    }

    // Perfect Week Bonus
    if (profile.currentStreak > 0 && profile.currentStreak % 7 === 0 && streakIncreased) {
        earnedXP += config.bonuses.perfectWeek;
        bonusMessages.push(`🌟 **Perfect Week Bonus:** +${config.bonuses.perfectWeek} XP`);
    }

    // Update user stats
    profile.xp = (profile.xp || 0) + earnedXP;
    profile.communityPoints = (profile.communityPoints || 0) + config.communityPointsReward;

    if (!profile.solvedQuestions.includes(active.id)) {
        profile.solvedQuestions.push(active.id);
    }

    const langKey = language.toLowerCase();
    profile.languageStats[langKey] = (profile.languageStats[langKey] || 0) + 1;

    // Active challenge solves list
    if (!active.solves) active.solves = [];
    if (!active.solves.includes(userId)) {
        active.solves.push(userId);
    }

    const newBadges = checkBadges(profile);

    await db.saveUserProfile(profile);
    await db.setActiveChallenge(active);

    return {
        isCorrect: true,
        earnedXP,
        communityPoints: config.communityPointsReward,
        currentStreak: profile.currentStreak,
        highestStreak: profile.highestStreak,
        streakIncreased,
        bonusMessages,
        newBadges
    };
}

/**
 * Renders Leaderboard Embed.
 */
async function renderLeaderboard(filter = 'All Time') {
    const data = await db.getLeaderboardData();

    const embed = new EmbedBuilder()
        .setTitle(`🏆 Programming Challenge Leaderboard (${filter})`)
        .setColor(0xf1c40f)
        .setTimestamp();

    if (!data || data.length === 0) {
        embed.setDescription('No users on the leaderboard yet! Be the first to solve a challenge.');
        return embed;
    }

    const ranks = ['🥇', '🥈', '🥉'];
    let desc = '';

    const top = data.slice(0, 10);
    for (let i = 0; i < top.length; i++) {
        const u = top[i];
        const badgeIcon = ranks[i] || `**#${i + 1}**`;
        const pointsStr = u.communityPoints ? ` | 💎 **${u.communityPoints} Pts**` : '';
        desc += `${badgeIcon} <@${u.userId}> — ⭐ **${u.xp} XP**${pointsStr} | 🎯 Solved: **${u.solved}** | 🔥 Streak: **${u.streak}d** | 🎯 Acc: **${u.accuracy}%**\n`;
    }

    embed.setDescription(desc);
    return embed;
}

/**
 * Renders User Profile Embed.
 */
async function renderProfile(user) {
    const profile = await db.getUserProfile(user.id);
    const leaderboardData = await db.getLeaderboardData();
    const rankIndex = leaderboardData.findIndex(u => u.userId === user.id);
    const rankStr = rankIndex !== -1 ? `#${rankIndex + 1}` : 'Unranked';

    const badgesList = (profile.badges || []).map(bId => {
        const found = Object.values(config.badges).find(b => b.id === bId);
        return found ? `${found.icon} ${found.name}` : bId;
    }).join('\n') || 'None unlocked yet';

    const embed = new EmbedBuilder()
        .setTitle(`👨‍💻 Developer Profile: ${user.username}`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setColor(0x3498db)
        .addFields(
            { name: '⭐ Level & XP', value: `Level **${profile.level}** (${profile.xp} XP)`, inline: true },
            { name: '🏆 Leaderboard Rank', value: `\`${rankStr}\``, inline: true },
            { name: '💎 Community Points', value: `\`${profile.communityPoints}\``, inline: true },
            { name: '🔥 Current Streak', value: `\`${profile.currentStreak} Days\``, inline: true },
            { name: '⚡ Highest Streak', value: `\`${profile.highestStreak} Days\``, inline: true },
            { name: '🎯 Accuracy', value: `\`${profile.accuracy}%\` (${profile.solvedQuestions.length}/${profile.attempts} attempts)`, inline: true },
            { name: '🎖️ Badges Unlocked', value: badgesList, inline: false }
        )
        .setTimestamp();

    return embed;
}

/**
 * Message command listener handler (!python, /python, etc.).
 */
async function handleMessageCommand(message) {
    if (!message || message.author?.bot) return;

    // 1. Strict Server & Channel Filter
    const targetChannelId = config.channelId || process.env.PROGRAMMING_CHANNEL_ID;
    const targetServerId = config.serverId || process.env.PROGRAMMING_SERVER_ID;

    // Ignore DMs, threads, voice, forums, and all non-matching channels/servers immediately
    if (!message.guild || !targetChannelId || message.channel.id !== targetChannelId) return;
    if (targetServerId && message.guild.id !== targetServerId) return;

    // 2. Strict Message Validation Filter
    // Only process messages starting with /python, /java, /javascript, /csharp, /cpp, /c
    const content = message.content ? message.content.trim() : '';
    const validPrefixes = ['/python', '/java', '/javascript', '/csharp', '/cpp', '/c'];
    
    const lowerContent = content.toLowerCase();
    const hasValidPrefix = validPrefixes.some(prefix => 
        lowerContent === prefix || lowerContent.startsWith(prefix + ' ') || lowerContent.startsWith(prefix + '\n')
    );

    if (!hasValidPrefix) {
        return; // Ignore completely! No AI, no code evaluation, no reply, no logs.
    }

    const firstSpace = content.search(/\s/);
    const commandName = (firstSpace !== -1 ? content.slice(1, firstSpace) : content.slice(1)).toLowerCase();
    const rawArgs = firstSpace !== -1 ? content.slice(firstSpace + 1).trim() : '';

    const langConfig = Object.keys(config.languages).find(l => 
        l === commandName || config.languages[l].aliases.includes(commandName)
    );

    if (langConfig) {
        if (!rawArgs) {
            return message.reply('⚠️ Please provide your code answer after the command!\n*Example:* `/python print(sum(numbers))`');
        }

        const res = await processSubmission(
            message.author.id,
            message.author.tag,
            message.author.displayAvatarURL(),
            langConfig,
            rawArgs
        );

        if (res.error) {
            return message.reply(res.error);
        }

        if (res.isCorrect) {
            if (res.alreadyCompleted) {
                return message.reply("⚠️ You have already completed today's programming challenge.\n\nYour rewards have already been claimed.");
            }
            let msg = `✅ **Correct Answer!**\n\n+${res.earnedXP} XP\n+${res.communityPoints} Community Points\n🔥 Streak Increased (**${res.currentStreak} Days**)`;
            if (res.bonusMessages && res.bonusMessages.length > 0) {
                msg += `\n\n${res.bonusMessages.join('\n')}`;
            }
            if (res.newBadges && res.newBadges.length > 0) {
                msg += `\n\n🎉 **New Badge Unlocked:** ${res.newBadges.map(b => `${b.icon} ${b.name}`).join(', ')}`;
            }
            return message.reply(msg);
        } else {
            if (res.errorType === 'InternalEvaluationError') {
                return message.reply('⚠️ Internal Evaluation Error');
            }
            if (res.isError) {
                let errTitle = 'Execution Error';
                if (res.errorType === 'CompilationError') errTitle = 'Compilation Error';
                if (res.errorType === 'RuntimeError') errTitle = 'Runtime Error';
                if (res.errorType === 'TimeLimitExceeded') errTitle = 'Time Limit Exceeded';

                let replyStr = `❌ **${errTitle}**`;
                if (res.errorMessage) {
                    replyStr += `\n\`\`\`\n${res.errorMessage}\n\`\`\``;
                }
                return message.reply(replyStr);
            }
            return message.reply(`❌ **Wrong Answer**\n\n💡 **Hint:** ${res.hint}`);
        }
    }

    if (commandName === 'leaderboard') {
        const embed = await renderLeaderboard('All Time');
        return message.reply({ embeds: [embed] });
    }

    if (commandName === 'profile') {
        const embed = await renderProfile(message.author);
        return message.reply({ embeds: [embed] });
    }

    if (commandName === 'challenge') {
        return handleAdminTextCommand(message, rawArgs);
    }
}

function isUserAdmin(member) {
    if (!member) return false;
    if (member.permissions && (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        member.permissions.has(PermissionFlagsBits.ManageMessages)
    )) {
        return true;
    }
    const roleName = (process.env.ROLE_NAME || 'basher').toLowerCase();
    if (member.roles && member.roles.cache && member.roles.cache.some(r => r.name.toLowerCase() === roleName)) {
        return true;
    }
    return false;
}

/**
 * Handles text-based admin commands: !challenge force, !challenge skip, etc.
 */
async function handleAdminTextCommand(message, rawArgs) {
    const parts = rawArgs.split(' ');
    const subCmd = (parts[0] || '').toLowerCase();

    if (!isUserAdmin(message.member)) {
        return message.reply('⛔ Only Administrators or Moderators can use `/challenge` management commands.');
    }

    if (subCmd === 'force' || subCmd === 'skip') {
        const sent = await scheduler.postDailyChallenge(message.client);
        if (sent) {
            return message.reply(`✅ Next daily challenge has been forced/skipped and posted to <#${config.channelId}>!`);
        } else {
            return message.reply('❌ Failed to post challenge. Check configuration.');
        }
    }

    if (subCmd === 'leaderboard' && parts[1] === 'reset') {
        await db.resetLeaderboard();
        return message.reply('🧹 Programming Challenge leaderboard has been reset.');
    }

    if (subCmd === 'create' || subCmd === 'add') {
        return message.reply('💡 To create a new question, use Slash Command `/challenge add title:... difficulty:... category:... description:...`');
    }

    if (subCmd === 'delete') {
        const qId = parts[1];
        if (!qId) return message.reply('Usage: `/challenge delete <question_id>`');
        const deleted = questions.deleteQuestion(qId);
        return message.reply(deleted ? `✅ Question \`${qId}\` deleted.` : `❌ Question \`${qId}\` not found.`);
    }

    return message.reply('Available commands: `/challenge force`, `/challenge skip`, `/challenge leaderboard reset`, `/challenge delete <id>`');
}

/**
 * Handles Discord Interaction Slash Commands.
 */
async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    const langConfig = Object.keys(config.languages).find(l => l === commandName);
    if (langConfig) {
        await interaction.deferReply();
        const code = options.getString('code');

        const res = await processSubmission(
            interaction.user.id,
            interaction.user.tag,
            interaction.user.displayAvatarURL(),
            langConfig,
            code
        );

        if (res.error) {
            return interaction.editReply(res.error);
        }

        if (res.isCorrect) {
            if (res.alreadyCompleted) {
                return interaction.editReply("⚠️ You have already completed today's programming challenge.\n\nYour rewards have already been claimed.");
            }
            let msg = `✅ **Correct Answer!**\n\n+${res.earnedXP} XP\n+${res.communityPoints} Community Points\n🔥 Streak Increased (**${res.currentStreak} Days**)`;
            if (res.bonusMessages && res.bonusMessages.length > 0) {
                msg += `\n\n${res.bonusMessages.join('\n')}`;
            }
            if (res.newBadges && res.newBadges.length > 0) {
                msg += `\n\n🎉 **New Badge Unlocked:** ${res.newBadges.map(b => `${b.icon} ${b.name}`).join(', ')}`;
            }
            return interaction.editReply(msg);
        } else {
            if (res.errorType === 'InternalEvaluationError') {
                return interaction.editReply('⚠️ Internal Evaluation Error');
            }
            if (res.isError) {
                let errTitle = 'Execution Error';
                if (res.errorType === 'CompilationError') errTitle = 'Compilation Error';
                if (res.errorType === 'RuntimeError') errTitle = 'Runtime Error';
                if (res.errorType === 'TimeLimitExceeded') errTitle = 'Time Limit Exceeded';

                let replyStr = `❌ **${errTitle}**`;
                if (res.errorMessage) {
                    replyStr += `\n\`\`\`\n${res.errorMessage}\n\`\`\``;
                }
                return interaction.editReply(replyStr);
            }
            return interaction.editReply(`❌ **Wrong Answer**\n\n💡 **Hint:** ${res.hint}`);
        }
    }

    if (commandName === 'programming-leaderboard' || commandName === 'leaderboard') {
        await interaction.deferReply();
        const filter = options.getString('filter') || 'All Time';
        const embed = await renderLeaderboard(filter);
        return interaction.editReply({ embeds: [embed] });
    }

    if (commandName === 'profile') {
        await interaction.deferReply();
        const targetUser = options.getUser('user') || interaction.user;
        const embed = await renderProfile(targetUser);
        return interaction.editReply({ embeds: [embed] });
    }

    if (commandName === 'challenge') {
        await interaction.deferReply();
        if (!isUserAdmin(interaction.member)) {
            return interaction.editReply('⛔ Only Administrators or Moderators can use `/challenge` management commands.');
        }
        const subGroup = options.getSubcommand();

        if (subGroup === 'force' || subGroup === 'skip') {
            const sent = await scheduler.postDailyChallenge(interaction.client);
            return interaction.editReply(sent ? '✅ Daily challenge has been posted!' : '❌ Failed to post challenge.');
        }

        if (subGroup === 'reset') {
            await db.resetLeaderboard();
            return interaction.editReply('🧹 Leaderboard stats reset.');
        }

        if (subGroup === 'delete') {
            const qId = options.getString('id');
            const deleted = questions.deleteQuestion(qId);
            return interaction.editReply(deleted ? `✅ Question \`${qId}\` deleted.` : `❌ Question \`${qId}\` not found.`);
        }

        if (subGroup === 'add' || subGroup === 'create') {
            const newQ = {
                id: `q_${Date.now()}`,
                title: options.getString('title'),
                difficulty: options.getString('difficulty'),
                category: options.getString('category'),
                description: options.getString('description'),
                hint: options.getString('hint') || 'Check your algorithm logic.',
                testCases: []
            };
            questions.addQuestion(newQ);
            return interaction.editReply(`✅ Added new challenge **${newQ.title}** (ID: \`${newQ.id}\`)`);
        }
    }
}

module.exports = {
    handleMessageCommand,
    handleInteraction,
    processSubmission,
    renderLeaderboard,
    renderProfile
};
