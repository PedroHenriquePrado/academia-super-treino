PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gym_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  gym_name TEXT NOT NULL DEFAULT 'Academia Super Treino',
  slogan TEXT DEFAULT 'Sua evolução começa aqui',
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  cnpj TEXT,
  cep TEXT,
  street TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  logo_data TEXT,
  receipt_footer TEXT DEFAULT 'Obrigado pela confiança. Bons treinos!',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  months INTEGER NOT NULL DEFAULT 1,
  default_value REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  birth_date TEXT,
  address TEXT,
  cep TEXT,
  street TEXT,
  number TEXT,
  complement TEXT,
  neighborhood TEXT,
  city TEXT,
  state TEXT,
  start_date TEXT NOT NULL,
  plan_id INTEGER,
  monthly_value REAL NOT NULL DEFAULT 0,
  due_day INTEGER NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  photo_url TEXT,
  photo_data TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  reference_month TEXT NOT NULL,
  due_date TEXT NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  paid_at TEXT,
  payment_method TEXT,
  receipt_number TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, reference_month),
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  contact_date TEXT NOT NULL,
  goal TEXT,
  interest TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Novo',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS workout_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  audience TEXT,
  level TEXT,
  notes TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS workout_template_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  workout_label TEXT NOT NULL DEFAULT 'Treino A',
  exercise TEXT NOT NULL,
  sets TEXT NOT NULL,
  reps TEXT NOT NULL,
  rest TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(template_id) REFERENCES workout_templates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  template_id INTEGER NOT NULL,
  assigned_at TEXT NOT NULL,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY(template_id) REFERENCES workout_templates(id) ON DELETE CASCADE
);


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



CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  failures INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_students_status_name ON students(status, name);
CREATE INDEX IF NOT EXISTS idx_invoices_student_ref ON invoices(student_id, reference_month);
CREATE INDEX IF NOT EXISTS idx_invoices_status_due ON invoices(status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_paid_at ON invoices(paid_at);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_workouts_student_active ON student_workouts(student_id, active);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

INSERT OR IGNORE INTO gym_settings (id, gym_name, slogan, receipt_footer)
VALUES (1, 'Academia Super Treino', 'Sua evolução começa aqui', 'Obrigado pela confiança. Bons treinos!');

INSERT OR IGNORE INTO plans (id, name, months, default_value, active) VALUES
  (1, 'Mensal', 1, 90, 1),
  (2, 'Trimestral', 3, 250, 1),
  (3, 'Semestral', 6, 480, 1);

INSERT OR IGNORE INTO workout_templates (id,name,audience,level,notes,is_system) VALUES (1,'Iniciante masculino','Masculino','Iniciante','Modelo geral de adaptação. Ajuste cargas, limitações e frequência conforme o aluno.',1);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 1,'Treino A','Supino reto','3','10–12','60–90s',0 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=1 AND sort_order=0);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 1,'Treino A','Puxada frente','3','10–12','60–90s',1 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=1 AND sort_order=1);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 1,'Treino A','Agachamento livre ou guiado','3','10–12','60–90s',2 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=1 AND sort_order=2);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 1,'Treino A','Desenvolvimento com halteres','3','10–12','60s',3 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=1 AND sort_order=3);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 1,'Treino A','Rosca direta','2','12','60s',4 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=1 AND sort_order=4);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 1,'Treino A','Tríceps corda','2','12','60s',5 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=1 AND sort_order=5);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 1,'Treino A','Prancha','3','30–45s','45s',6 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=1 AND sort_order=6);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 1,'Treino B','Leg press','3','10–12','60–90s',7 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=1 AND sort_order=7);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 1,'Treino B','Remada baixa','3','10–12','60–90s',8 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=1 AND sort_order=8);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 1,'Treino B','Supino inclinado','3','10–12','60–90s',9 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=1 AND sort_order=9);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 1,'Treino B','Mesa flexora','3','12','60s',10 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=1 AND sort_order=10);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 1,'Treino B','Elevação lateral','2','12–15','60s',11 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=1 AND sort_order=11);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 1,'Treino B','Panturrilha em pé','3','12–15','45–60s',12 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=1 AND sort_order=12);

INSERT OR IGNORE INTO workout_templates (id,name,audience,level,notes,is_system) VALUES (2,'Iniciante feminino','Feminino','Iniciante','Modelo geral de adaptação com ênfase equilibrada em membros inferiores e superiores.',1);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 2,'Treino A','Agachamento guiado','3','10–12','60–90s',0 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=2 AND sort_order=0);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 2,'Treino A','Cadeira extensora','3','12','60s',1 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=2 AND sort_order=1);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 2,'Treino A','Puxada frente','3','10–12','60–90s',2 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=2 AND sort_order=2);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 2,'Treino A','Supino máquina','3','10–12','60–90s',3 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=2 AND sort_order=3);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 2,'Treino A','Elevação pélvica','3','12','60–90s',4 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=2 AND sort_order=4);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 2,'Treino A','Prancha','3','30s','45s',5 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=2 AND sort_order=5);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 2,'Treino B','Leg press','3','10–12','60–90s',6 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=2 AND sort_order=6);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 2,'Treino B','Mesa flexora','3','12','60s',7 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=2 AND sort_order=7);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 2,'Treino B','Remada baixa','3','10–12','60–90s',8 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=2 AND sort_order=8);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 2,'Treino B','Desenvolvimento máquina','3','10–12','60s',9 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=2 AND sort_order=9);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 2,'Treino B','Abdução de quadril','3','15','45–60s',10 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=2 AND sort_order=10);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 2,'Treino B','Panturrilha sentada','3','15','45s',11 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=2 AND sort_order=11);

INSERT OR IGNORE INTO workout_templates (id,name,audience,level,notes,is_system) VALUES (3,'Intermediário masculino','Masculino','Intermediário','Modelo ABC. Ajuste volume semanal, intensidade e exercícios ao histórico do aluno.',1);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 3,'Treino A','Supino reto','4','6–10','90s',0 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=3 AND sort_order=0);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 3,'Treino A','Supino inclinado com halteres','3','8–12','75s',1 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=3 AND sort_order=1);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 3,'Treino A','Crucifixo máquina','3','12–15','60s',2 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=3 AND sort_order=2);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 3,'Treino A','Tríceps corda','3','10–12','60s',3 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=3 AND sort_order=3);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 3,'Treino A','Tríceps francês','3','10–12','60s',4 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=3 AND sort_order=4);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 3,'Treino B','Puxada alta','4','8–12','75s',5 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=3 AND sort_order=5);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 3,'Treino B','Remada curvada','4','8–10','90s',6 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=3 AND sort_order=6);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 3,'Treino B','Remada baixa','3','10–12','75s',7 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=3 AND sort_order=7);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 3,'Treino B','Rosca direta','3','8–12','60s',8 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=3 AND sort_order=8);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 3,'Treino B','Rosca martelo','3','10–12','60s',9 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=3 AND sort_order=9);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 3,'Treino C','Agachamento livre','4','6–10','90–120s',10 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=3 AND sort_order=10);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 3,'Treino C','Leg press','4','10–12','90s',11 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=3 AND sort_order=11);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 3,'Treino C','Mesa flexora','3','10–12','75s',12 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=3 AND sort_order=12);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 3,'Treino C','Cadeira extensora','3','12–15','60s',13 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=3 AND sort_order=13);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 3,'Treino C','Panturrilha','4','12–15','60s',14 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=3 AND sort_order=14);

INSERT OR IGNORE INTO workout_templates (id,name,audience,level,notes,is_system) VALUES (4,'Intermediário feminino','Feminino','Intermediário','Modelo ABC com trabalho completo e maior volume de membros inferiores.',1);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 4,'Treino A','Agachamento livre','4','8–10','90s',0 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=4 AND sort_order=0);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 4,'Treino A','Leg press','4','10–12','90s',1 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=4 AND sort_order=1);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 4,'Treino A','Cadeira extensora','3','12–15','60s',2 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=4 AND sort_order=2);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 4,'Treino A','Panturrilha','4','12–15','60s',3 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=4 AND sort_order=3);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 4,'Treino B','Puxada frente','4','8–12','75s',4 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=4 AND sort_order=4);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 4,'Treino B','Remada baixa','3','10–12','75s',5 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=4 AND sort_order=5);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 4,'Treino B','Supino com halteres','3','8–12','75s',6 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=4 AND sort_order=6);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 4,'Treino B','Elevação lateral','3','12–15','60s',7 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=4 AND sort_order=7);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 4,'Treino B','Rosca + tríceps corda','3','10–12','60s',8 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=4 AND sort_order=8);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 4,'Treino C','Elevação pélvica','4','8–12','90s',9 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=4 AND sort_order=9);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 4,'Treino C','Stiff','4','8–10','90s',10 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=4 AND sort_order=10);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 4,'Treino C','Mesa flexora','3','10–12','75s',11 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=4 AND sort_order=11);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 4,'Treino C','Abdução de quadril','3','15–20','60s',12 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=4 AND sort_order=12);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 4,'Treino C','Afundo','3','10 cada','75s',13 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=4 AND sort_order=13);

INSERT OR IGNORE INTO workout_templates (id,name,audience,level,notes,is_system) VALUES (5,'Avançado masculino','Masculino','Avançado','Modelo ABCD de referência. Deve ser individualizado por profissional responsável.',1);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino A','Supino reto','4','5–8','120s',0 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=0);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino A','Supino inclinado','4','8–10','90s',1 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=1);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino A','Crossover','3','12–15','60s',2 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=2);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino A','Tríceps testa','3','8–12','75s',3 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=3);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino A','Tríceps corda','3','12–15','60s',4 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=4);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino B','Barra fixa ou puxada','4','6–10','90s',5 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=5);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino B','Remada curvada','4','6–10','120s',6 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=6);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino B','Remada unilateral','3','10–12','75s',7 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=7);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino B','Rosca direta','3','8–10','75s',8 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=8);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino B','Rosca inclinada','3','10–12','60s',9 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=9);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino C','Agachamento livre','5','5–8','120s',10 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=10);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino C','Leg press','4','8–12','90s',11 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=11);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino C','Stiff','4','8–10','90s',12 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=12);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino C','Cadeira extensora','3','12–15','60s',13 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=13);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino C','Panturrilha','5','10–15','60s',14 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=14);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino D','Desenvolvimento','4','6–10','90s',15 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=15);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino D','Elevação lateral','4','12–15','60s',16 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=16);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino D','Crucifixo inverso','4','12–15','60s',17 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=17);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino D','Encolhimento','3','10–12','75s',18 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=18);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 5,'Treino D','Abdominal','4','12–20','45s',19 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=5 AND sort_order=19);

INSERT OR IGNORE INTO workout_templates (id,name,audience,level,notes,is_system) VALUES (6,'Avançado feminino','Feminino','Avançado','Modelo ABCD de referência com alto volume. Deve ser individualizado por profissional responsável.',1);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino A','Agachamento livre','5','5–8','120s',0 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=0);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino A','Leg press','4','8–12','90s',1 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=1);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino A','Afundo','3','10 cada','75s',2 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=2);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino A','Cadeira extensora','3','12–15','60s',3 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=3);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino B','Puxada alta','4','8–10','90s',4 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=4);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino B','Remada baixa','4','8–12','75s',5 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=5);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino B','Supino inclinado','3','8–12','75s',6 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=6);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino B','Elevação lateral','4','12–15','60s',7 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=7);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino B','Braços combinado','3','10–12','60s',8 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=8);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino C','Elevação pélvica','5','6–10','120s',9 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=9);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino C','Stiff','4','6–10','90s',10 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=10);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino C','Mesa flexora','4','10–12','75s',11 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=11);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino C','Abdução de quadril','4','15–20','60s',12 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=12);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino C','Extensão de quadril','3','12–15','60s',13 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=13);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino D','Agachamento búlgaro','4','8–10 cada','90s',14 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=14);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino D','Hack squat','4','8–12','90s',15 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=15);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino D','Flexora unilateral','3','10–12','60s',16 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=16);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino D','Panturrilha','4','12–15','60s',17 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=17);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 6,'Treino D','Core','4','30–45s','45s',18 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=6 AND sort_order=18);

INSERT OR IGNORE INTO workout_templates (id,name,audience,level,notes,is_system) VALUES (7,'Idosos','Todos','Adaptado','Modelo de referência com foco em autonomia, força e equilíbrio. Exige avaliação e adaptações individuais.',1);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 7,'Treino A','Sentar e levantar do banco','3','8–12','60–90s',0 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=7 AND sort_order=0);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 7,'Treino A','Leg press leve','3','10–12','60–90s',1 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=7 AND sort_order=1);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 7,'Treino A','Remada sentada','3','10–12','60–90s',2 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=7 AND sort_order=2);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 7,'Treino A','Chest press máquina','2–3','10–12','60–90s',3 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=7 AND sort_order=3);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 7,'Treino A','Elevação de panturrilha','3','12–15','60s',4 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=7 AND sort_order=4);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 7,'Treino A','Caminhada controlada','1','8–15 min','—',5 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=7 AND sort_order=5);
INSERT OR IGNORE INTO workout_template_items (template_id,workout_label,exercise,sets,reps,rest,sort_order) SELECT 7,'Treino A','Equilíbrio com apoio próximo','3','20–30s','45s',6 WHERE NOT EXISTS (SELECT 1 FROM workout_template_items WHERE template_id=7 AND sort_order=6);
