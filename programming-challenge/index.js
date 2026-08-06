const { Events, SlashCommandBuilder, REST, Routes } = require('discord.js');
const db = require('./db');
const questions = require('./questions');
const scheduler = require('./scheduler');
const handlers = require('./handlers');
const api = require('./api');
const config = require('./config');

function getSlashCommands() {
    const langCommands = Object.keys(config.languages).map(lang => 
        new SlashCommandBuilder()
            .setName(lang)
            .setDescription(`Submit solution in ${config.languages[lang].name}`)
            .addStringOption(opt => opt.setName('code').setDescription('Your solution code').setRequired(true))
    );

    const programmingLeaderboardCmd = new SlashCommandBuilder()
        .setName('programming-leaderboard')
        .setDescription('View the Daily Programming Challenge leaderboard')
        .addStringOption(opt => 
            opt.setName('filter')
                .setDescription('Leaderboard timeframe filter')
                .addChoices(
                    { name: 'All Time', value: 'All Time' },
                    { name: 'Monthly', value: 'Monthly' },
                    { name: 'Weekly', value: 'Weekly' }
                )
        );

    const profileCmd = new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View developer profile and stats')
        .addUserOption(opt => opt.setName('user').setDescription('Target user'));

    const challengeCmd = new SlashCommandBuilder()
        .setName('challenge')
        .setDescription('Programming Challenge Admin Commands')
        .addSubcommand(sub => sub.setName('force').setDescription('Force post the daily challenge immediately'))
        .addSubcommand(sub => sub.setName('skip').setDescription('Skip to the next daily challenge'))
        .addSubcommand(sub => sub.setName('reset').setDescription('Reset leaderboard statistics'))
        .addSubcommand(sub => 
            sub.setName('delete')
                .setDescription('Delete a question by ID')
                .addStringOption(opt => opt.setName('id').setDescription('Question ID').setRequired(true))
        )
        .addSubcommand(sub => 
            sub.setName('add')
                .setDescription('Add a new challenge question')
                .addStringOption(opt => opt.setName('title').setDescription('Question Title').setRequired(true))
                .addStringOption(opt => opt.setName('difficulty').setDescription('Easy / Medium / Hard').setRequired(true))
                .addStringOption(opt => opt.setName('category').setDescription('Category').setRequired(true))
                .addStringOption(opt => opt.setName('description').setDescription('Description').setRequired(true))
                .addStringOption(opt => opt.setName('hint').setDescription('Hint message'))
        );

    return [
        ...langCommands,
        programmingLeaderboardCmd,
        profileCmd,
        challengeCmd
    ];
}

function init(client, app, botStatus) {
    console.log('🚀 [Programming Challenge Module] Initializing Daily Programming Challenge System...');

    // 1. Initialize DB and Question Bank
    db.initDB();
    questions.initQuestionBank();

    // 2. Register Web Dashboard Routes if Express app is present
    if (app) {
        api.registerRoutes(app);
    }

    // 3. Register Event Listeners
    client.on(Events.MessageCreate, async (message) => {
        try {
            await handlers.handleMessageCommand(message);
        } catch (err) {
            console.error('❌ [Programming Challenge] Error handling message command:', err);
        }
    });

    // 4. On ready initialization
    const onReady = async () => {
        console.log('🤖 [Programming Challenge] Bot ready — starting scheduler...');
        scheduler.startScheduler(client);
        console.log('✅ [Programming Challenge Module] Fully initialized.');
    };

    if (client.isReady()) {
        onReady();
    } else {
        client.once(Events.ClientReady, onReady);
    }
}

module.exports = {
    init,
    getSlashCommands,
    handleInteraction: handlers.handleInteraction
};
