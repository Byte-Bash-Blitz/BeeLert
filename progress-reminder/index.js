const { Events } = require('discord.js');
const path = require('path');
const express = require('express');
const config = require('./config');
const tracker = require('./tracker');
const scheduler = require('./scheduler');
const api = require('./api');
const { supabase } = require('../services/supabaseService');

function init(client, app, botStatus) {
    console.log('🔌 [Progress Reminder] Initializing database-driven progress system...');

    // 1. Register message listener immediately to catch real-time progress messages
    tracker.registerMessageListener(client);

    // 2. If Express app is provided, register web dashboard routes & assets
    if (app) {
        try {
            // Mount static files under /dashboard
            app.use('/dashboard', express.static(path.join(__dirname, '../dashboard')));
            
            // Register REST API routes
            api.registerRoutes(app, client, botStatus);
            console.log('✅ [Progress Reminder Web] Dashboard mounted at /dashboard');
        } catch (error) {
            console.error('❌ [Progress Reminder Web] Error mounting dashboard routes:', error.message);
        }
    } else {
        console.warn('⚠️ [Progress Reminder Web] Express app instance not provided. Web dashboard is disabled.');
    }

    const onReady = async () => {
        console.log('🤖 [Progress Reminder] Discord client is ready. Starting startup tasks...');
        try {
            // 3. Load config from database (falls back to JSON file / env variables)
            await config.loadDatabaseConfig(supabase);

            if (!config.pairs || config.pairs.length === 0) {
                console.warn('⚠️ [Progress Reminder] No configurations found. Plugin disabled.');
                return;
            }

            // 4. Scan today's progress (checks Forum threads/messages)
            await tracker.loadTodayProgress(client);

            // 5. Start cron scheduler (first consolidated reminder, second private DM, inactive check)
            scheduler.startScheduler(client);
            
            console.log('✅ [Progress Reminder] Plugin fully initialized and running.');
        } catch (error) {
            console.error('❌ [Progress Reminder] Error during startup initialization:', error);
        }
    };

    if (client.isReady()) {
        onReady();
    } else {
        client.once(Events.ClientReady, onReady);
    }
}

module.exports = {
    init
};
