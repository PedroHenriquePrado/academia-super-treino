-- V1.8: carga sugerida e séries registradas pelo aluno.
-- Nenhuma tabela de aluno, cobrança ou pagamento é modificada.
ALTER TABLE workout_template_items ADD COLUMN suggested_load TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS student_exercise_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  set_number INTEGER NOT NULL CHECK(set_number BETWEEN 1 AND 20),
  exercise_name TEXT NOT NULL,
  workout_label TEXT NOT NULL,
  load_kg REAL CHECK(load_kg IS NULL OR (load_kg >= 0 AND load_kg <= 1000)),
  completed_at TEXT NOT NULL,
  UNIQUE(student_id,item_id,day,set_number),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_student_exercise_sets_history ON student_exercise_sets(student_id,day DESC);
