-- =========================================
-- mPlugins Discord Bot - Migration 003
-- Fase 2 do refinamento: sistema de moderacao
--
-- Regras seguidas:
--  - Nunca apagar dados existentes.
--  - Uma unica tabela "punishments" cobre warn/mute/kick/ban, em vez de
--    tabelas separadas (ex.: "warnings" + "punishments"): evita duas
--    fontes de verdade divergentes para o mesmo historico de um usuario.
-- =========================================

CREATE TABLE IF NOT EXISTS punishments (
    id               SERIAL PRIMARY KEY,
    guild_id         VARCHAR(32) NOT NULL,
    discord_id       VARCHAR(32) NOT NULL,
    moderator_id     VARCHAR(32) NOT NULL,
    type             VARCHAR(16) NOT NULL,
    reason           TEXT NOT NULL,
    duration_seconds INTEGER,
    status           VARCHAR(16) NOT NULL DEFAULT 'ativo',
    expires_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at       TIMESTAMPTZ,
    revoked_by       VARCHAR(32),
    revoked_reason   TEXT,
    CHECK (type IN ('warn', 'mute', 'kick', 'ban')),
    CHECK (status IN ('ativo', 'revogado', 'expirado')),
    CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS idx_punishments_guild_discord
    ON punishments (guild_id, discord_id);

CREATE INDEX IF NOT EXISTS idx_punishments_guild_type_status
    ON punishments (guild_id, type, status);

CREATE INDEX IF NOT EXISTS idx_punishments_created_at
    ON punishments (created_at DESC);

-- No maximo um mute ATIVO por usuario por guild (o Discord so permite um
-- timeout ativo por vez de qualquer forma, mas o banco reforca aqui).
CREATE UNIQUE INDEX IF NOT EXISTS idx_punishments_um_mute_ativo
    ON punishments (guild_id, discord_id)
    WHERE type = 'mute' AND status = 'ativo';

-- No maximo um ban ATIVO por usuario por guild.
CREATE UNIQUE INDEX IF NOT EXISTS idx_punishments_um_ban_ativo
    ON punishments (guild_id, discord_id)
    WHERE type = 'ban' AND status = 'ativo';
