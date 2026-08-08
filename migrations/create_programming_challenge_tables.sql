-- Supabase Migration Script for Daily Programming Challenge System Module

-- 1. Create programming_challenges Table
CREATE TABLE IF NOT EXISTS programming_challenges (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    category TEXT NOT NULL,
    test_cases JSONB DEFAULT '[]'::jsonb,
    hint TEXT,
    posted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT false,
    solves JSONB DEFAULT '[]'::jsonb,
    first_solver_id TEXT,
    fastest_solver_id TEXT,
    fastest_time_ms BIGINT
);

-- Index for active challenges query
CREATE INDEX IF NOT EXISTS idx_programming_challenges_active ON programming_challenges(is_active, posted_at DESC);

-- 2. Create user_programming_stats Table
CREATE TABLE IF NOT EXISTS user_programming_stats (
    user_id TEXT PRIMARY KEY,
    xp INT DEFAULT 0,
    level INT DEFAULT 1,
    community_points INT DEFAULT 0,
    solved_questions JSONB DEFAULT '[]'::jsonb,
    attempts INT DEFAULT 0,
    accuracy NUMERIC(5, 2) DEFAULT 0.00,
    badges JSONB DEFAULT '[]'::jsonb,
    current_streak INT DEFAULT 0,
    highest_streak INT DEFAULT 0,
    last_solved_date TIMESTAMP WITH TIME ZONE,
    language_stats JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for leaderboard XP ranking
CREATE INDEX IF NOT EXISTS idx_user_programming_stats_xp ON user_programming_stats(xp DESC);

-- 3. Create challenge_submissions Table
CREATE TABLE IF NOT EXISTS challenge_submissions (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    challenge_id TEXT NOT NULL REFERENCES programming_challenges(id) ON DELETE CASCADE,
    language TEXT NOT NULL,
    code TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for anti-cheat & similarity lookups
CREATE INDEX IF NOT EXISTS idx_challenge_submissions_lookup ON challenge_submissions(challenge_id, is_correct);

-- 4. Enable Row Level Security (RLS) & Policies for Web Dashboard and Bot access
ALTER TABLE programming_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_programming_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all for anon" ON programming_challenges FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON user_programming_stats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON challenge_submissions FOR ALL USING (true) WITH CHECK (true);
