const config = require('./config');
const db = require('./db');
const tracker = require('./tracker');
const scheduler = require('./scheduler');

async function init(client) {
    console.log('🎙️ [Voice Monitor Plugin] Initializing Voice Activity Monitoring System...');
    try {
        // Load database configuration from Supabase if table exists
        const { supabase } = require('../services/supabaseService');
        await config.loadDatabaseConfig(supabase);

        // Startup active sessions recovery
        tracker.initStartupRecovery(client);

        // Register 11 PM cron scheduler
        scheduler.startScheduler(client);

        console.log(`✅ [Voice Monitor Plugin] Fully initialized. Monitoring 4 Clan VCs: ${Object.keys(config.CLAN_VOICE_CHANNELS).join(', ')}...`);
    } catch (err) {
        console.error('❌ [Voice Monitor Plugin] Initialization error:', err);
    }
}

module.exports = {
    init,
    handleVoiceStateUpdate: tracker.handleVoiceStateUpdate,
    generateAndSendDailyReport: scheduler.generateAndSendDailyReport,
    config,
    db,
    tracker,
    scheduler
};
