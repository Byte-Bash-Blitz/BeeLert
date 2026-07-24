-- ============================================
-- PROGRESS REMINDER SYSTEM CONFIGURATION & LOGS
-- Run this in your Supabase SQL Editor
-- ============================================

-- Config table
CREATE TABLE IF NOT EXISTS progress_reminder_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_server_id TEXT NOT NULL,
    community_progress_channel_id TEXT NOT NULL UNIQUE,
    clan_server_id TEXT NOT NULL,
    clan_reminder_channel_id TEXT NOT NULL,
    tracked_members JSONB NOT NULL DEFAULT '[]'::jsonb,
    first_reminder_time TEXT NOT NULL DEFAULT '21:00', -- 9:00 PM (Clan Channel Alert)
    second_reminder_time TEXT NOT NULL DEFAULT '23:00', -- 11:00 PM (Private DM)
    inactive_alert_time TEXT NOT NULL DEFAULT '10:00', -- 10:00 AM (Next Day Inactive Alert)
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast lookup on the progress channel ID
CREATE INDEX IF NOT EXISTS idx_progress_reminder_config_channel ON progress_reminder_config(community_progress_channel_id);

-- Logs table (for tracking sent reminders to prevent duplicates)
CREATE TABLE IF NOT EXISTS progress_reminder_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_progress_channel_id TEXT NOT NULL,
    discord_user_id TEXT NOT NULL,
    reminder_type TEXT NOT NULL,          -- 'first', 'second', 'inactive'
    reminder_date DATE NOT NULL,          -- YYYY-MM-DD in IST timezone
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(community_progress_channel_id, discord_user_id, reminder_type, reminder_date)
);

-- Indices for fast duplicate checking
CREATE INDEX IF NOT EXISTS idx_reminder_logs_lookup ON progress_reminder_logs(community_progress_channel_id, discord_user_id, reminder_type, reminder_date);

-- Enable RLS
ALTER TABLE progress_reminder_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_reminder_logs ENABLE ROW LEVEL SECURITY;

-- Allow bot access (all permissions for simplicity/anon key)
CREATE POLICY "Enable all for anon" ON progress_reminder_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON progress_reminder_logs FOR ALL USING (true) WITH CHECK (true);

-- Seed with initial pair configuration
INSERT INTO progress_reminder_config (
    community_server_id,
    community_progress_channel_id,
    clan_server_id,
    clan_reminder_channel_id,
    tracked_members,
    first_reminder_time,
    second_reminder_time,
    inactive_alert_time
) VALUES (
    '1163002451746623528',
    '1351223274750869554',
    '1350324319942868992',
    '1350324320496255104',
    '["1438025229774618734","1309201554787664026","1337604789378482228","1439166845109407826","1181238306671968256","1438727184209416266","1259881373309861888","1411180696604512267","1438161218144829442","1344619303688998934","1344618947185606707","1308385757576036412"]'::jsonb,
    '21:00',
    '23:00',
    '10:00'
) ON CONFLICT (community_progress_channel_id) DO UPDATE SET
    community_server_id = EXCLUDED.community_server_id,
    clan_server_id = EXCLUDED.clan_server_id,
    clan_reminder_channel_id = EXCLUDED.clan_reminder_channel_id,
    tracked_members = EXCLUDED.tracked_members,
    first_reminder_time = EXCLUDED.first_reminder_time,
    second_reminder_time = EXCLUDED.second_reminder_time,
    inactive_alert_time = EXCLUDED.inactive_alert_time;
