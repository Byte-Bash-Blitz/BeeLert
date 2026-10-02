require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

async function sync() {
    const rawUrl = process.env.SUPABASE_URL;
    const rawKey = process.env.SUPABASE_KEY;

    if (!rawUrl || !rawKey) {
        console.error('❌ SUPABASE_URL or SUPABASE_KEY missing in .env');
        process.exit(1);
    }

    const supabase = createClient(
        rawUrl.trim().replace(/^["']|["']$/g, '').trim(),
        rawKey.trim().replace(/^["']|["']$/g, '').trim()
    );

    console.log('📡 Checking if daily_voice_monitor_sessions exists in Supabase...');
    const { error: checkErr } = await supabase
        .from('daily_voice_monitor_sessions')
        .select('id')
        .limit(1);

    if (checkErr) {
        console.error('❌ Table daily_voice_monitor_sessions not found in Supabase!');
        console.error('👉 Please run the SQL migration in your Supabase SQL Editor first:');
        console.error('   https://supabase.com/dashboard/project/kxolautvyktglktnnvdl/sql/new');
        return;
    }

    console.log('✅ Table verified!');

    const sessionsPath = path.join(__dirname, '..', 'voice-monitor-sessions.json');
    if (!fs.existsSync(sessionsPath)) {
        console.log('No local sessions file found.');
        return;
    }

    const localSessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8') || '[]');
    console.log(`📦 Found ${localSessions.length} local sessions to sync...`);

    let synced = 0;
    for (const s of localSessions) {
        const payload = {
            session_id: s.sessionId,
            discord_user_id: s.discordUserId,
            username: s.username,
            display_name: s.displayName || s.username,
            clan_name: s.clanName,
            guild_id: s.guildId,
            voice_channel_id: s.voiceChannelId,
            join_time: s.joinTime,
            leave_time: s.leaveTime,
            duration_seconds: s.durationSeconds || 0,
            session_date: s.sessionDate
        };

        const { error } = await supabase
            .from('daily_voice_monitor_sessions')
            .upsert(payload, { onConflict: 'session_id' });

        if (error) {
            console.error(`❌ Failed to sync session ${s.sessionId}:`, error.message);
        } else {
            synced++;
        }
    }

    console.log(`🎉 Sync completed! Successfully synced ${synced}/${localSessions.length} sessions to Supabase.`);
}

sync().catch(err => console.error('Fatal sync error:', err));
