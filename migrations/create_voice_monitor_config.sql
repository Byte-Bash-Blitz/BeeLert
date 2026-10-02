-- ============================================
-- VOICE MONITOR CONFIGURATION TABLE & SEED
-- Run this in your Supabase SQL Editor
-- ============================================

-- 1. Create table for dynamic voice monitor settings
CREATE TABLE IF NOT EXISTS voice_monitor_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    main_server_id TEXT NOT NULL DEFAULT '1163002451746623528',
    voice_report_server_id TEXT NOT NULL DEFAULT '1551622661254291578',
    report_channel_id TEXT NOT NULL DEFAULT '1555597926510887012',
    aura_vc_id TEXT NOT NULL DEFAULT '1497644357870682324',
    belmont_vc_id TEXT NOT NULL DEFAULT '1497644587974394087',
    lumina_vc_id TEXT NOT NULL DEFAULT '1497644767813828648',
    shadastria_vc_id TEXT NOT NULL DEFAULT '1497644966824906923',
    cron_schedule TEXT NOT NULL DEFAULT '0 23 * * *',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE voice_monitor_config ENABLE ROW LEVEL SECURITY;

-- 3. Allow bot access via anon/service key
DROP POLICY IF EXISTS "Enable all for anon" ON voice_monitor_config;
CREATE POLICY "Enable all for anon" ON voice_monitor_config FOR ALL USING (true) WITH CHECK (true);

-- 4. Seed with the updated Voice Report Server and Channel
INSERT INTO voice_monitor_config (
    voice_report_server_id,
    report_channel_id,
    main_server_id,
    aura_vc_id,
    belmont_vc_id,
    lumina_vc_id,
    shadastria_vc_id,
    cron_schedule,
    timezone,
    is_active
) VALUES (
    '1551622661254291578',
    '1555597926510887012',
    '1163002451746623528',
    '1497644357870682324',
    '1497644587974394087',
    '1497644767813828648',
    '1497644966824906923',
    '0 23 * * *',
    'Asia/Kolkata',
    true
);
