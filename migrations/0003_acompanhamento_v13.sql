-- V1.3: registro durável dos exercícios marcados, por dia e bloco.
-- Mantém uma fotografia dos totais, mesmo se o modelo de treino for alterado.
-- Não modifica as tabelas de alunos, mensalidades, pagamentos nem usuários.
CREATE TABLE IF NOT EXISTS student_workout_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  workout_assignment_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  workout_label TEXT NOT NULL,
  template_name TEXT NOT NULL,
  total_exercises INTEGER NOT NULL DEFAULT 0,
  completed_exercises INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(student_id, workout_assignment_id, day, workout_label),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_student_workout_daily_student_day
ON student_workout_daily(student_id,day DESC);

-- Aproveita as marcações da V1.2 já existentes no banco local/online.
-- Só reconstitui o que ainda existe em student_exercise_checks.
INSERT OR IGNORE INTO student_workout_daily
(student_id,workout_assignment_id,day,workout_label,template_name,total_exercises,completed_exercises,updated_at)
SELECT c.student_id,
       COALESCE((SELECT sw.id FROM student_workouts sw
                 WHERE sw.student_id=c.student_id AND sw.template_id=i.template_id AND sw.assigned_at<=c.day
                 ORDER BY sw.id DESC LIMIT 1),0),
       c.day,i.workout_label,t.name,
       (SELECT COUNT(*) FROM workout_template_items ti
        WHERE ti.template_id=i.template_id AND ti.workout_label=i.workout_label),
       COUNT(DISTINCT c.item_id),MAX(c.completed_at)
FROM student_exercise_checks c
JOIN workout_template_items i ON i.id=c.item_id
JOIN workout_templates t ON t.id=i.template_id
GROUP BY c.student_id,c.day,i.template_id,i.workout_label;
