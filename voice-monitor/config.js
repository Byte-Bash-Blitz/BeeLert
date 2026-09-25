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

module.exports = {
    MAIN_SERVER_ID: process.env.MAIN_SERVER_ID || '1163002451746623528',
    CLAN_SERVER_ID: process.env.CLAN_SERVER_ID || '1350324319942868992',
    MONITORED_VC_ID: process.env.MONITORED_VC_ID || '1497644357870682324', // Backwards compatibility for AURA VC
    REPORT_CHANNEL_ID: process.env.REPORT_CHANNEL_ID || '1550189180942811156',
    CRON_SCHEDULE: '0 23 * * *', // Every day at 11:00 PM IST
    TIMEZONE: 'Asia/Kolkata',
    CLAN_VOICE_CHANNELS,
    MONITORED_VC_IDS,
    CHANNEL_TO_CLAN,
    getClanByChannelId,
    isMonitoredVc
};
