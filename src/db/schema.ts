/**
 * SQLite schema and database initialisation.
 * Spec: docs/data-models.md — Entities
 * Tech: expo-sqlite (direct, not WatermelonDB — per project-state.md decision)
 *
 * Call initializeDatabase() once at app startup via SQLiteProvider's onInit:
 *
 *   <SQLiteProvider databaseName="medrecord.db" onInit={initializeDatabase}>
 *     ...
 *   </SQLiteProvider>
 */

import * as SQLite from 'expo-sqlite';

export const DB_NAME = 'medrecord.db';

export async function initializeDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- Patient local cache.
    -- server_id is null until the record has been synced to the server.
    -- synced_at is null for locally-created patients not yet pushed.
    CREATE TABLE IF NOT EXISTS patients (
      local_id        TEXT PRIMARY KEY,
      server_id       TEXT,
      mobile_number   TEXT NOT NULL UNIQUE,
      name            TEXT,
      date_of_birth   TEXT,
      gender          TEXT,
      last_visit_date TEXT,
      synced_at       TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_patient_mobile
      ON patients (mobile_number);
    CREATE INDEX IF NOT EXISTS idx_patient_last_visit
      ON patients (last_visit_date DESC);

    -- Offline write queue.
    -- Every write operation (create/update) is enqueued here before the
    -- network call. Background sync worker drains this table in queued_at order.
    -- Spec: docs/offline-sync-spec.md — Sync Queue Behaviour
    CREATE TABLE IF NOT EXISTS sync_queue (
      id              TEXT PRIMARY KEY,
      entity_type     TEXT NOT NULL,      -- patient | visit | record | consent
      entity_local_id TEXT NOT NULL,
      operation       TEXT NOT NULL,      -- create | update
      payload         TEXT NOT NULL,      -- JSON snapshot of entity at queue time
      queued_at       TEXT NOT NULL,
      attempts        INTEGER NOT NULL DEFAULT 0,
      last_attempt_at TEXT,
      status          TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | success | failed
      error_message   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_queue_pending
      ON sync_queue (status, queued_at ASC)
      WHERE status = 'pending';

    -- Maps device-generated local_ids to server-assigned UUIDs after sync.
    -- Used by the sync worker to resolve foreign key references within a batch.
    -- Spec: docs/offline-sync-spec.md — ID Resolution
    CREATE TABLE IF NOT EXISTS id_mapping (
      local_id    TEXT PRIMARY KEY,
      server_id   TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      mapped_at   TEXT NOT NULL
    );
  `);
}
