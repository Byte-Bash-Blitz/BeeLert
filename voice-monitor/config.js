// Configuration constants for Daily Voice Activity Monitoring
const CLAN_VOICE_CHANNELS = {
    AURA: {
        id: process.env.AURA_VC_ID || '1497644357870682324',
        name: 'AURA',
        emoji: '🟢'
    },
    BELMONT: {
        id: process.env.BELMONT_VC_ID || '1497644587974394087',
        name: 'BELMONT',
        emoji: '🔵'
    },
    LUMINA: {
        id: process.env.LUMINA_VC_ID || '1497644767813828648',
        name: 'LUMINA',
        emoji: '🟣'
    },
    SHADASTRIA: {
        id: process.env.SHADASTRIA_VC_ID || '1497644966824906923',
        name: 'SHADASTRIA',
        emoji: '🟠'
    }
};

const MONITORED_VC_IDS = Object.values(CLAN_VOICE_CHANNELS).map(c => c.id);

const CHANNEL_TO_CLAN = Object.values(CLAN_VOICE_CHANNELS).reduce((acc, c) => {
    acc[c.id] = c;
    return acc;
}, {});

function getClanByChannelId(channelId) {
    return CHANNEL_TO_CLAN[channelId] || null;
}

function isMonitoredVc(channelId) {
    return Boolean(channelId && CHANNEL_TO_CLAN[channelId]);
}

async function loadDatabaseConfig(supabase) {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('voice_monitor_config')
            .select('*')
            .eq('is_active', true)
            .limit(1);

        if (!error && data && data.length > 0) {
            const row = data[0];
            if (row.voice_report_server_id) {
                module.exports.CLAN_SERVER_ID = String(row.voice_report_server_id).trim();
                module.exports.VOICE_REPORT_SERVER_ID = String(row.voice_report_server_id).trim();
            }
            if (row.report_channel_id) {
                module.exports.REPORT_CHANNEL_ID = String(row.report_channel_id).trim();
            }
            if (row.main_server_id) {
                module.exports.MAIN_SERVER_ID = String(row.main_server_id).trim();
            }
            if (row.aura_vc_id) CLAN_VOICE_CHANNELS.AURA.id = String(row.aura_vc_id).trim();
            if (row.belmont_vc_id) CLAN_VOICE_CHANNELS.BELMONT.id = String(row.belmont_vc_id).trim();
            if (row.lumina_vc_id) CLAN_VOICE_CHANNELS.LUMINA.id = String(row.lumina_vc_id).trim();
            if (row.shadastria_vc_id) CLAN_VOICE_CHANNELS.SHADASTRIA.id = String(row.shadastria_vc_id).trim();

            console.log('📋 [Voice Monitor Config] Successfully loaded config from Supabase:', {
                voiceReportServerId: module.exports.VOICE_REPORT_SERVER_ID,
                reportChannelId: module.exports.REPORT_CHANNEL_ID,
                mainServerId: module.exports.MAIN_SERVER_ID
            });
        }
    } catch (e) {
        // Table might not exist yet, fallback to env/defaults
    }
}

module.exports = {
    MAIN_SERVER_ID: process.env.MAIN_SERVER_ID || '1163002451746623528',
    CLAN_SERVER_ID: process.env.VOICE_REPORT_SERVER_ID || process.env.CLAN_SERVER_ID || '1551622661254291578',
    VOICE_REPORT_SERVER_ID: process.env.VOICE_REPORT_SERVER_ID || process.env.CLAN_SERVER_ID || '1551622661254291578',
    MONITORED_VC_ID: process.env.MONITORED_VC_ID || '1497644357870682324', // Backwards compatibility for AURA VC
    REPORT_CHANNEL_ID: process.env.REPORT_CHANNEL_ID || '1555597926510887012',
    CRON_SCHEDULE: '0 23 * * *', // Every day at 11:00 PM IST
    TIMEZONE: 'Asia/Kolkata',
    CLAN_VOICE_CHANNELS,
    MONITORED_VC_IDS,
    CHANNEL_TO_CLAN,
    getClanByChannelId,
    isMonitoredVc,
    loadDatabaseConfig
};
