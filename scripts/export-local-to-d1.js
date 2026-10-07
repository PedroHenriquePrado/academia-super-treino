import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
const output = process.argv[3] || path.resolve('local-data.sql');
if (!input) {
  console.error('Uso: node scripts/export-local-to-d1.js "CAMINHO\\super-treino.db" [arquivo-saida.sql]');
  process.exit(1);
}
if (!fs.existsSync(input)) {
  console.error(`Banco não encontrado: ${input}`);
  process.exit(1);
}

const db = new DatabaseSync(input, { readOnly: true });
const tableOrder = [
  'gym_settings','plans','students','invoices','leads',
  'workout_templates','workout_template_items','student_workouts'
];
const deleteOrder = [
  'student_workouts','workout_template_items','invoices','leads',
  'students','workout_templates','plans','gym_settings'
];
const targetColumns = {
  gym_settings:['id','gym_name','slogan','phone','whatsapp','email','cnpj','cep','street','number','complement','neighborhood','city','state','logo_data','receipt_footer','updated_at'],
  plans:['id','name','months','default_value','active'],
  students:['id','name','phone','birth_date','address','cep','street','number','complement','neighborhood','city','state','start_date','plan_id','monthly_value','due_day','status','notes','photo_url','photo_data','created_at','updated_at'],
  invoices:['id','student_id','reference_month','due_date','amount','status','paid_at','payment_method','receipt_number','notes','created_at'],
  leads:['id','name','phone','contact_date','goal','interest','notes','status','created_at','updated_at'],
  workout_templates:['id','name','audience','level','notes','is_system','created_at','updated_at'],
  workout_template_items:['id','template_id','workout_label','exercise','sets','reps','rest','sort_order'],
  student_workouts:['id','student_id','template_id','assigned_at','notes','active']
};
function q(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return String(v);
  if (v instanceof Uint8Array || Buffer.isBuffer(v)) return `X'${Buffer.from(v).toString('hex')}'`;
  return `'${String(v).replaceAll("'", "''")}'`;
}
function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function existingColumns(name) {
  return new Set(db.prepare(`PRAGMA table_info(${name})`).all().map(c=>c.name));
}

let sql = `-- Migração gerada pelo Academia Super Treino Online\n-- Origem: ${input}\n-- Gerado em: ${new Date().toISOString()}\n-- Importação D1: sem BEGIN/COMMIT explícitos\n\n`;
for (const t of deleteOrder) sql += `DELETE FROM ${t};\n`;
sql += '\n';
for (const t of tableOrder) {
  if (!tableExists(t)) continue;
  const have = existingColumns(t);
  const cols = targetColumns[t].filter(c=>have.has(c));
  const rows = db.prepare(`SELECT ${cols.map(c=>`"${c}"`).join(',')} FROM ${t}`).all();
  for (const row of rows) {
    sql += `INSERT INTO ${t} (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${cols.map(c=>q(row[c])).join(',')});\n`;
  }
  sql += '\n';
}

fs.writeFileSync(output, sql, 'utf8');
console.log(`Pronto: ${output}`);
console.log('Agora importe com: npx wrangler d1 execute super-treino-prod --remote --file=./local-data.sql');
