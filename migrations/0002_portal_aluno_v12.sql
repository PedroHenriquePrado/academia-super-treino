
-- V1.2: credenciais e acompanhamento independentes da área administrativa.
-- Essas tabelas NÃO alteram cadastros, cobranças ou pagamentos existentes.
CREATE TABLE IF NOT EXISTS student_portal_accounts (
  student_id INTEGER PRIMARY KEY,
  password_hash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS student_portal_sessions (
  token_hash TEXT PRIMARY KEY,
  student_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_student_portal_sessions_student ON student_portal_sessions(student_id);
CREATE TABLE IF NOT EXISTS student_exercise_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id,item_id,day),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY(item_id) REFERENCES workout_template_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_student_exercise_checks_daily ON student_exercise_checks(student_id,day);
