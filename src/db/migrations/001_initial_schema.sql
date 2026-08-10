-- =========================================
-- mPlugins Discord Bot - Migration 001
-- Fase 1-3: fundacao + setup automatico
-- (mantido como estava; setup_registry e substituida
--  por setup_objects na migration 002, com renomeacao segura)
-- =========================================

-- Registro de tudo que o /setup cria na guild.
-- Usado para evitar duplicacao e para o /setup cleanup.
CREATE TABLE IF NOT EXISTS setup_registry (
    id          SERIAL PRIMARY KEY,
    guild_id    VARCHAR(32)  NOT NULL,
    tipo        VARCHAR(16)  NOT NULL, -- 'role' | 'category' | 'channel'
    nome        VARCHAR(128) NOT NULL,
    object_id   VARCHAR(32)  NOT NULL,
    criado_em   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (guild_id, tipo, object_id)
);

CREATE INDEX IF NOT EXISTS idx_setup_registry_guild
    ON setup_registry (guild_id);

CREATE INDEX IF NOT EXISTS idx_setup_registry_guild_tipo
    ON setup_registry (guild_id, tipo);

-- Controle de versao das migrations aplicadas.
CREATE TABLE IF NOT EXISTS schema_migrations (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(128) NOT NULL UNIQUE,
    aplicada_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Tabela base de membros por guild, usada nas proximas etapas
-- (ranks, gastos, tickets). Criada aqui apenas com o essencial
-- para nao quebrar comandos que ja fazem referencia a ela.
CREATE TABLE IF NOT EXISTS members (
    id            SERIAL PRIMARY KEY,
    guild_id      VARCHAR(32) NOT NULL,
    user_id       VARCHAR(32) NOT NULL,
    total_gasto   NUMERIC(12,2) NOT NULL DEFAULT 0,
    rank_atual    VARCHAR(64),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_members_guild
    ON members (guild_id);
