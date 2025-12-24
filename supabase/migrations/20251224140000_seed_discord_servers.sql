-- Seed Discord servers into subreddit_registry (platform = 'discord')
-- Based on ananya-discord-registry.md

-- Tier 1 - Daily Monitoring
INSERT INTO subreddit_registry (name, url, tier, platform, notes)
VALUES
  ('Nomi AI', 'discord.gg/nomiai', 1, 'discord', 'Values-aligned competitor; memory-focused; users appreciate emotional depth'),
  ('Kindroid', 'discord.gg/kindroid', 1, 'discord', 'Active dev engagement; Friday movie nights; technical users who value quality'),
  ('Replika', 'discord.com/invite/MzV2Jr9uhD', 1, 'discord', 'Emotionally invested users; exact target demographic'),
  ('Candy AI', 'discord.com/invite/candyai', 1, 'discord', 'Direct market competitor; beginner users')
ON CONFLICT DO NOTHING;

-- Tier 2 - 2-3x Weekly
INSERT INTO subreddit_registry (name, url, tier, platform, notes)
VALUES
  ('Character.AI', 'discord.com/invite/characterai', 2, 'discord', 'Massive; frustrated users re: filters; has forum channels'),
  ('Character AI No Filter', 'discord.gg/km7k8vNvJ8', 2, 'discord', 'Frustrated C.AI refugees actively seeking alternatives'),
  ('AI Dungeon', 'discord.com/invite/RcYntV44fF', 2, 'discord', 'Storytelling/RP focus; users value narrative depth'),
  ('NovelAI', 'discord.gg/novelai', 2, 'discord', 'Creative writing focus; users appreciate quality over quantity')
ON CONFLICT DO NOTHING;

-- Tier 3 - Weekly
INSERT INTO subreddit_registry (name, url, tier, platform, notes)
VALUES
  ('Janitor AI', 'discord.com/invite/janitorai', 3, 'discord', 'Large NSFW-adjacent; different positioning but useful intel'),
  ('CrushOn AI', 'discord.gg/crushonai', 3, 'discord', 'NSFW positioning; monitor for market trends'),
  ('SpicyChat AI', 'discord.gg/ruexExw2nr', 3, 'discord', '24/7 support channel; monitor only'),
  ('DreamGF', 'discord.gg/3vfDWVpM63', 3, 'discord', 'Smaller; visual focus'),
  ('Pygmalion AI', 'discord.gg/pygmalionai', 3, 'discord', 'Open-source crowd; technical insights')
ON CONFLICT DO NOTHING;

-- Tier 4 - Monitor Only
INSERT INTO subreddit_registry (name, url, tier, platform, notes)
VALUES
  ('Chai AI', 'discord.gg/yjBJ3efD', 4, 'discord', 'Unofficial server; approach carefully')
ON CONFLICT DO NOTHING;
