-- Seed Nico's approved Discord channels
-- Specific forum channels validated for engagement (complaint/frustration threads)

DELETE FROM subreddit_registry WHERE platform = 'discord';

INSERT INTO subreddit_registry (name, url, platform, notes) VALUES
  ('Candy AI', 'https://discord.com/channels/1144976541105786880/1399412226561015919', 'discord', 'candy-discussions'),
  ('Kindroid AI (issues)', 'https://discord.com/channels/1116127115574779905/1450973477174644938', 'discord', 'issues-and-venting'),
  ('Kindroid AI (non-kindroid)', 'https://discord.com/channels/1116127115574779905/1266171666040619040', 'discord', 'non-kindroid-ai-discussions'),
  ('CrushOn AI', 'https://discord.com/channels/1097566904391921756/1097569289520635996', 'discord', 'suggestions'),
  ('Nomi AI', 'https://discord.com/channels/1099791840028405864/1100159956092735628', 'discord', 'product-feedback'),
  ('Replika', 'https://discord.com/channels/1084973512827080835/1227369682705580103', 'discord', 'feedback'),
  ('Character AI', 'https://discord.com/channels/1017072750386483332/1175980610095960185', 'discord', 'feedback');
