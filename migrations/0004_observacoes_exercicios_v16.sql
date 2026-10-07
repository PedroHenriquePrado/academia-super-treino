-- V1.6: observação do professor por exercício.
-- Apenas acrescenta uma coluna ao modelo de treino existente.
-- Não altera alunos, cobranças, pagamentos nem registros de progresso.
ALTER TABLE workout_template_items ADD COLUMN exercise_notes TEXT NOT NULL DEFAULT '';
