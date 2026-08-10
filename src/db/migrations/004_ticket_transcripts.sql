-- =========================================
-- mPlugins Discord Bot - Migration 004
-- Fase 3 do refinamento: transcript de tickets
-- =========================================

CREATE TABLE IF NOT EXISTS ticket_transcripts (
    id             SERIAL PRIMARY KEY,
    ticket_id      INTEGER NOT NULL REFERENCES tickets(id),
    guild_id       VARCHAR(32) NOT NULL,
    discord_id     VARCHAR(32) NOT NULL,
    channel_id     VARCHAR(32) NOT NULL,
    message_count  INTEGER NOT NULL DEFAULT 0,
    content        TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_transcripts_ticket_id
    ON ticket_transcripts (ticket_id);

CREATE INDEX IF NOT EXISTS idx_ticket_transcripts_guild_id
    ON ticket_transcripts (guild_id);
