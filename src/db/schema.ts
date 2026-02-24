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
      doctor_id       TEXT NOT NULL DEFAULT '',
      server_id       TEXT,
      mobile_number   TEXT NOT NULL UNIQUE,
      name            TEXT,
      date_of_birth   TEXT,
      gender          TEXT,
      consent_granted INTEGER NOT NULL DEFAULT 0,
      last_visit_date TEXT,
      synced_at       TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_patient_mobile
      ON patients (mobile_number);
    CREATE INDEX IF NOT EXISTS idx_patient_last_visit
      ON patients (last_visit_date DESC);
    CREATE INDEX IF NOT EXISTS idx_patient_doctor
      ON patients (doctor_id);

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

    -- Visit cache — populated from GET /patients/:serverId/visits (D3).
    -- server_id is the primary key; all rows here come from the server.
    -- Locally-created draft visits (D6) will use a separate visits_draft table.
    -- chief_complaint is null for other-doctor visits when consent is absent —
    -- the server excludes it at the query layer (build constraint D3-H-1).
    CREATE TABLE IF NOT EXISTS visits (
      server_id          TEXT PRIMARY KEY,
      patient_server_id  TEXT NOT NULL,
      visit_date         TEXT NOT NULL,   -- server-assigned UTC ISO — authoritative (QA E-6)
      chief_complaint    TEXT,
      clinic_name        TEXT NOT NULL DEFAULT '',
      record_count       INTEGER NOT NULL DEFAULT 0,
      is_own_visit       INTEGER NOT NULL DEFAULT 0,  -- 1=current doctor created it
      synced_at          TEXT NOT NULL,
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_visits_patient
      ON visits (patient_server_id, visit_date DESC);

    -- Audit event log — DPDP Act 2023 §§ 5, 8 (data access audit trail).
    -- Tracks consent_accessed, patient_searched, and similar auditable events.
    -- Synced to server via POST /sync on reconnect (tracked as H-3 pre-merge blocker).
    CREATE TABLE IF NOT EXISTS audit_events (
      id          TEXT PRIMARY KEY,
      event_type  TEXT NOT NULL,   -- consent_accessed | patient_searched | etc.
      doctor_id   TEXT NOT NULL,
      patient_id  TEXT NOT NULL,   -- server patient ID
      metadata    TEXT,            -- JSON blob for event-specific fields
      created_at  TEXT NOT NULL,
      synced_at   TEXT             -- null until flushed to server POST /sync
    );

    CREATE INDEX IF NOT EXISTS idx_audit_events_unsynced
      ON audit_events (synced_at, created_at ASC)
      WHERE synced_at IS NULL;
  `);

  // Migration: add new columns to existing databases that predate this schema.
  // SQLite throws if the column already exists, so each ALTER is wrapped
  // in its own try/catch — this is a no-op on fresh installs.
  try {
    await db.execAsync(
      `ALTER TABLE patients ADD COLUMN doctor_id TEXT NOT NULL DEFAULT '';`,
    );
  } catch {
    // Column already exists — safe to ignore.
  }
  try {
    await db.execAsync(
      `ALTER TABLE patients ADD COLUMN consent_granted INTEGER NOT NULL DEFAULT 0;`,
    );
  } catch {
    // Column already exists — safe to ignore.
  }
}
