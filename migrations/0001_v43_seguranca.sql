-- V4.3 - Executar somente pela ferramenta de migrations do Wrangler.
-- Não apaga nem altera valores de mensalidades ou pagamentos existentes.
ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1));
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN (0,1));
ALTER TABLE sessions ADD COLUMN csrf_token TEXT;
ALTER TABLE students ADD COLUMN archived_at TEXT;
ALTER TABLE students ADD COLUMN archive_reason TEXT;
CREATE TABLE IF NOT EXISTS audit_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 actor_name TEXT NOT NULL,
 action TEXT NOT NULL,
 entity_type TEXT NOT NULL,
 entity_id INTEGER,
 description TEXT,
 old_data TEXT,
 new_data TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type,entity_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_students_archived_at ON students(archived_at);
