require('dotenv').config();
const { supabase } = require('../services/supabaseService');
const fs = require('fs');
const path = require('path');

async function cleanFakeLogs() {
    console.log('🧹 [Cleanup] Starting removal of fake/test logs from Supabase & local files...');

    if (supabase) {
        // 1. Delete test rows from daily_voice_monitor_sessions
        console.log('1. Deleting test sessions from Supabase daily_voice_monitor_sessions...');
        const testUserPatterns = ['test_user%', 'user_test%', 'user_rollover%', '%verificationhero%'];
        
        for (const pattern of testUserPatterns) {
            const { count, error } = await supabase
                .from('daily_voice_monitor_sessions')
                .delete({ count: 'exact' })
                .or(`discord_user_id.ilike.${pattern},username.ilike.${pattern}`);
            console.log(`   Deleted matching '${pattern}':`, count, error?.message || 'OK');
        }

        const { count: cDate, error: eDate } = await supabase
            .from('daily_voice_monitor_sessions')
            .delete({ count: 'exact' })
            .eq('session_date', '2099-05-15');
        console.log("   Deleted session_date = '2099-05-15':", cDate, eDate?.message || 'OK');

        // 2. Delete test rows from daily_voice_report_logs
        console.log('2. Deleting test reports from Supabase daily_voice_report_logs...');
        const { count: rCount1 } = await supabase
            .from('daily_voice_report_logs')
            .delete({ count: 'exact' })
            .eq('report_date', '2099-05-15');
        console.log("   Deleted report_date = '2099-05-15':", rCount1);

        // Also delete simulated test report for 2026-10-02 if created by test
        const { count: rCount2 } = await supabase
            .from('daily_voice_report_logs')
            .delete({ count: 'exact' })
            .eq('report_date', '2026-10-02');
        console.log("   Deleted test report for '2026-10-02':", rCount2);

        // 3. Delete test rows from progress_reminder_logs
        console.log('3. Deleting test rows from progress_reminder_logs...');
        for (const pattern of testUserPatterns) {
            const { count } = await supabase
                .from('progress_reminder_logs')
                .delete({ count: 'exact' })
                .ilike('discord_user_id', pattern);
            console.log(`   Deleted matching '${pattern}' from reminder logs:`, count);
        }

        // 4. Delete test rows from voice_sessions if any
        console.log('4. Deleting test rows from voice_sessions...');
        for (const pattern of testUserPatterns) {
            await supabase
                .from('voice_sessions')
                .delete()
                .or(`discord_user_id.ilike.${pattern},username.ilike.${pattern}`);
        }
        await supabase
            .from('voice_sessions')
            .delete()
            .eq('session_date', '2099-05-15');
    } else {
        console.warn('⚠️ Supabase client not available.');
    }

    // 5. Clean local files
    console.log('5. Cleaning local JSON files...');
    const sessionsFile = path.join(__dirname, '../voice-monitor-sessions.json');
    if (fs.existsSync(sessionsFile)) {
        const raw = JSON.parse(fs.readFileSync(sessionsFile, 'utf8') || '[]');
        const filtered = raw.filter(x => {
            const uid = String(x.discordUserId || x.discord_user_id || '').toLowerCase();
            const uname = String(x.username || x.displayName || '').toLowerCase();
            const sDate = String(x.sessionDate || x.session_date || '');
            if (uid.includes('test') || uid.includes('hero')) return false;
            if (uname.includes('test') || uname.includes('hero')) return false;
            if (sDate === '2099-05-15') return false;
            return true;
        });
        fs.writeFileSync(sessionsFile, JSON.stringify(filtered, null, 2), 'utf8');
        console.log(`   voice-monitor-sessions.json: reduced from ${raw.length} to ${filtered.length} entries.`);
    }

    const reportsFile = path.join(__dirname, '../voice-monitor-reports.json');
    if (fs.existsSync(reportsFile)) {
        const raw = JSON.parse(fs.readFileSync(reportsFile, 'utf8') || '[]');
        const filtered = raw.filter(x => {
            const rDate = String(x.reportDate || x.report_date || '');
            if (rDate === '2099-05-15') return false;
            if (x.clanBreakdown?.some(c => String(c.userId || '').includes('test'))) return false;
            return true;
        });
        fs.writeFileSync(reportsFile, JSON.stringify(filtered, null, 2), 'utf8');
        console.log(`   voice-monitor-reports.json: reduced from ${raw.length} to ${filtered.length} entries.`);
    }

    const activeFile = path.join(__dirname, '../voice-monitor-active.json');
    if (fs.existsSync(activeFile)) {
        const raw = JSON.parse(fs.readFileSync(activeFile, 'utf8') || '[]');
        const filtered = raw.filter(x => {
            const uid = String(x.discordUserId || '').toLowerCase();
            return !uid.includes('test') && !uid.includes('hero');
        });
        fs.writeFileSync(activeFile, JSON.stringify(filtered, null, 2), 'utf8');
        console.log(`   voice-monitor-active.json: reduced from ${raw.length} to ${filtered.length} entries.`);
    }

    console.log('✅ [Cleanup] Complete! All fake/test logs removed.');
}

cleanFakeLogs().then(() => process.exit(0)).catch(e => {
    console.error('Error during cleanup:', e);
    process.exit(1);
});
