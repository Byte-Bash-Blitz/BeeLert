const cron = require('node-cron');
const config = require('./config');
const state = require('./state');
const notifier = require('./notifier');

function getCronPatternFromTime(timeString, defaultTime = '19:00') {
    const defaultPattern = getCronPatternFromTimeHelper(defaultTime);
    if (!timeString) return defaultPattern;

    const parts = timeString.split(':');
    if (parts.length !== 2) {
        console.warn(`⚠️ [Progress Reminder] Invalid time format "${timeString}", falling back to "${defaultTime}".`);
        return defaultPattern;
    }

    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);

    if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        console.warn(`⚠️ [Progress Reminder] Out-of-bounds time value "${timeString}", falling back to "${defaultTime}".`);
        return defaultPattern;
    }

    return `${minute} ${hour} * * *`;
}

function getCronPatternFromTimeHelper(timeString) {
    const parts = timeString.split(':');
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    return `${minute} ${hour} * * *`;
}

function startScheduler(client) {
    if (!config.pairs || config.pairs.length === 0) {
        console.log('ℹ️ [Progress Reminder] No configured server pairs to schedule.');
        return;
    }

    console.log(`⏰ [Progress Reminder] Scheduling reminder checks for ${config.pairs.length} pair(s)...`);

    // Schedule jobs for each configured server pair
    config.pairs.forEach((pair, index) => {
        // A. 9:00 PM Consolidated Reminder (First Reminder)
        const firstPattern = getCronPatternFromTime(pair.firstReminderTime, '21:00');
        console.log(`⏰ [Progress Reminder] Scheduling pair ${index + 1} FIRST reminder (${pair.firstReminderTime}) with cron pattern: "${firstPattern}"`);
        cron.schedule(firstPattern, async () => {
            try {
                console.log(`⏰ [Progress Reminder] First reminder cron triggered for pair ${index + 1}`);
                await notifier.runFirstReminder(client, pair, index);
            } catch (error) {
                console.error(`❌ [Progress Reminder] Error running first reminder job for pair ${index + 1}:`, error.message);
            }
        });

        // B. 11:00 PM Private DM Reminder (Second Reminder)
        const secondPattern = getCronPatternFromTime(pair.secondReminderTime, '23:00');
        console.log(`⏰ [Progress Reminder] Scheduling pair ${index + 1} SECOND reminder (${pair.secondReminderTime}) with cron pattern: "${secondPattern}"`);
        cron.schedule(secondPattern, async () => {
            try {
                console.log(`⏰ [Progress Reminder] Second reminder cron triggered for pair ${index + 1}`);
                await notifier.runSecondReminder(client, pair, index);
            } catch (error) {
                console.error(`❌ [Progress Reminder] Error running second reminder job for pair ${index + 1}:`, error.message);
            }
        });

        // C. 10:00 AM Inactive Alert (Next Day Inactivity check)
        const inactivePattern = getCronPatternFromTime(pair.inactiveAlertTime, '10:00');
        console.log(`⏰ [Progress Reminder] Scheduling pair ${index + 1} INACTIVE alert (${pair.inactiveAlertTime}) with cron pattern: "${inactivePattern}"`);
        cron.schedule(inactivePattern, async () => {
            try {
                console.log(`⏰ [Progress Reminder] Inactive alert cron triggered for pair ${index + 1}`);
                await notifier.runInactiveAlert(client, pair, index);
            } catch (error) {
                console.error(`❌ [Progress Reminder] Error running inactive alert job for pair ${index + 1}:`, error.message);
            }
        });
    });

    // D. Midnight State Reset Job (forces local cache reset exactly at midnight)
    cron.schedule('0 0 * * *', () => {
        try {
            console.log('🌅 [Progress Reminder] Cron triggered: Resetting local state cache for the new day.');
            state.resetStateForNewDay();
        } catch (error) {
            console.error('❌ [Progress Reminder] Error resetting state at midnight:', error.message);
        }
    });

    console.log('✅ [Progress Reminder] Dynamic multi-stage cron scheduler started.');
}

module.exports = {
    startScheduler
};
