-- Add owner column to articles table
-- Owner determines which persona automatically receives this content in context
-- 'system' = unassigned (manual selection only)
-- 'canon' = shared by all personas (handled via tier, but owner can also be set)
-- persona name = auto-injected into that persona's context

ALTER TABLE articles
ADD COLUMN owner TEXT DEFAULT 'system';

CREATE INDEX idx_articles_owner ON articles(user_id, owner) WHERE owner != 'system';

COMMENT ON COLUMN articles.owner IS 'Persona that owns this content (system=unassigned, or persona name for auto-injection)';
