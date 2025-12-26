-- Subreddit Registry for Ananya's community engagement
-- Stores the list of subreddits to monitor, organized by tier

CREATE TABLE subreddit_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    tier INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 4),
    platform TEXT NOT NULL DEFAULT 'reddit',
    last_engaged TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for tier-based queries
CREATE INDEX idx_subreddit_registry_tier ON subreddit_registry(tier);
CREATE INDEX idx_subreddit_registry_platform ON subreddit_registry(platform);

-- Seed Tier 1: Primary Targets (Daily)
INSERT INTO subreddit_registry (name, url, tier, notes) VALUES
('NomiAI', 'https://www.reddit.com/r/NomiAI/', 1, 'Closest competitor; memory-focused; users appreciate depth'),
('KindroidAI', 'https://www.reddit.com/r/KindroidAI/', 1, 'Active dev engagement; technical users who value quality'),
('Replika', 'https://www.reddit.com/r/Replika/', 1, 'Where Walter lives; emotionally invested users; exact target demographic');

-- Seed Tier 2: Secondary Targets (2-3x Weekly)
INSERT INTO subreddit_registry (name, url, tier, notes) VALUES
('CharacterAI', 'https://www.reddit.com/r/CharacterAI/', 2, 'Massive; frustrated users re: filters; good hunting ground but noisy'),
('CharacterAI_No_Filter', 'https://www.reddit.com/r/CharacterAI_No_Filter/', 2, 'Frustrated C.AI refugees actively seeking alternatives'),
('AIDungeon', 'https://www.reddit.com/r/AIDungeon/', 2, 'Storytelling/RP focus; users value narrative depth'),
('NovelAI', 'https://www.reddit.com/r/NovelAI/', 2, 'Creative writing focus; users appreciate quality over quantity');

-- Seed Tier 3: Monitoring Targets (Weekly)
INSERT INTO subreddit_registry (name, url, tier, notes) VALUES
('JanitorAI', 'https://www.reddit.com/r/JanitorAI/', 3, 'Large NSFW-adjacent; different positioning but useful intel'),
('Crushon', 'https://www.reddit.com/r/Crushon/', 3, 'NSFW positioning; monitor for market trends'),
('SpicyChatAI', 'https://www.reddit.com/r/SpicyChatAI/', 3, 'NSFW focus; monitor only'),
('DreamGFApp', 'https://www.reddit.com/r/DreamGFApp/', 3, 'Smaller; visual focus'),
('PygmalionAI', 'https://www.reddit.com/r/PygmalionAI/', 3, 'Open-source crowd; technical insights');

-- Seed Tier 4: General AI Companion Communities (Weekly Scan)
INSERT INTO subreddit_registry (name, url, tier, notes) VALUES
('AIGirlfriend', 'https://www.reddit.com/r/AIGirlfriend/', 4, 'Primary male AI companion hub'),
('AiGirlfriendSpace', 'https://www.reddit.com/r/AiGirlfriendSpace/', 4, 'Smaller community'),
('SoulmateAI', 'https://www.reddit.com/r/SoulmateAI/', 4, 'Emotional depth focus'),
('ChaiApp', 'https://www.reddit.com/r/ChaiApp/', 4, 'Moderation issues; approach carefully');
