-- =========================================
-- mPlugins Discord Bot - Migration 002
-- Fase 4-6: sistema de ranks, PostgreSQL completo e tickets
--
-- Regras seguidas:
--  - Nunca apagar dados existentes.
--  - setup_registry (criada na migration 001) e renomeada para
--    setup_objects, o nome oficial definido nesta fase, preservando
--    todos os registros ja existentes.
-- =========================================

-- ---------------------------------------------
-- Renomeacao segura: setup_registry -> setup_objects
-- ---------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'setup_registry')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'setup_objects')
    THEN
        ALTER TABLE setup_registry RENAME TO setup_objects;
        ALTER TABLE setup_objects RENAME COLUMN tipo TO object_type;
        ALTER TABLE setup_objects RENAME COLUMN nome TO object_name;
        ALTER TABLE setup_objects RENAME COLUMN criado_em TO created_at;
    END IF;
END $$;

-- Caso nenhuma tabela anterior exista (instalacao nova), cria do zero.
CREATE TABLE IF NOT EXISTS setup_objects (
    id          SERIAL PRIMARY KEY,
    guild_id    VARCHAR(32)  NOT NULL,
    object_type VARCHAR(16)  NOT NULL, -- 'role' | 'category' | 'channel'
    object_name VARCHAR(128) NOT NULL,
    object_id   VARCHAR(32)  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (guild_id, object_type, object_id)
);

CREATE INDEX IF NOT EXISTS idx_setup_objects_guild
    ON setup_objects (guild_id);

CREATE INDEX IF NOT EXISTS idx_setup_objects_guild_type
    ON setup_objects (guild_id, object_type);

-- ---------------------------------------------
-- users: dados de rank/gasto por usuario do Discord
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id           SERIAL PRIMARY KEY,
    discord_id   VARCHAR(32) NOT NULL UNIQUE,
    total_spent  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_spent >= 0),
    current_rank VARCHAR(64),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_total_spent
    ON users (total_spent DESC);

-- ---------------------------------------------
-- purchases: compras/pedidos associados a um usuario
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
    id         SERIAL PRIMARY KEY,
    discord_id VARCHAR(32) NOT NULL,
    order_id   VARCHAR(128) NOT NULL,
    amount     NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    status     VARCHAR(32) NOT NULL DEFAULT 'pendente',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_purchases_discord_id
    ON purchases (discord_id);

CREATE INDEX IF NOT EXISTS idx_purchases_status
    ON purchases (status);

-- ---------------------------------------------
-- rank_history: historico de mudancas de rank
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS rank_history (
    id          SERIAL PRIMARY KEY,
    discord_id  VARCHAR(32) NOT NULL,
    old_rank    VARCHAR(64),
    new_rank    VARCHAR(64) NOT NULL,
    total_spent NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rank_history_discord_id
    ON rank_history (discord_id);

-- ---------------------------------------------
-- tickets: sistema de tickets de suporte
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
    id         SERIAL PRIMARY KEY,
    discord_id VARCHAR(32) NOT NULL,
    channel_id VARCHAR(32) NOT NULL UNIQUE,
    status     VARCHAR(16) NOT NULL DEFAULT 'aberto', -- 'aberto' | 'fechado'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tickets_discord_id
    ON tickets (discord_id);

CREATE INDEX IF NOT EXISTS idx_tickets_status
    ON tickets (status);

-- Garante no maximo um ticket ABERTO por usuario.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_um_aberto_por_usuario
    ON tickets (discord_id)
    WHERE status = 'aberto';

-- ---------------------------------------------
-- logs: log de eventos administrativos e do sistema
-- Nunca deve conter token, senha, webhook secret ou dados sensiveis.
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS logs (
    id         SERIAL PRIMARY KEY,
    guild_id   VARCHAR(32) NOT NULL,
    type       VARCHAR(32) NOT NULL,
    message    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_guild_id
    ON logs (guild_id);

CREATE INDEX IF NOT EXISTS idx_logs_type
    ON logs (type);

-- ---------------------------------------------
-- settings: configuracoes chave/valor (ex.: valores de rank customizados,
-- canal de promocao, etc.) para permitir configuracao futura sem migration.
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
    key        VARCHAR(128) PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
