import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
const output = process.argv[3] || path.resolve('restaurar-backup.sql');
if (!input || !fs.existsSync(input)) {
  console.error('Uso: node scripts/json-backup-to-sql.js "backup.json" [arquivo-saida.sql]');
  process.exit(1);
}
const backup=JSON.parse(fs.readFileSync(input,'utf8'));
if (backup.format !== 'super-treino-online-backup-v1' || !backup.tables) {
  console.error('Este arquivo não parece ser um backup JSON válido do Super Treino Online.');
  process.exit(1);
}
const order=['gym_settings','plans','students','invoices','leads','workout_templates','workout_template_items','student_workouts'];
const deleteOrder=['student_workouts','workout_template_items','invoices','leads','students','workout_templates','plans','gym_settings'];
function q(v){
  if(v===null||v===undefined) return 'NULL';
  if(typeof v==='number') return Number.isFinite(v)?String(v):'NULL';
  if(typeof v==='boolean') return v?'1':'0';
  return `'${String(v).replaceAll("'","''")}'`;
}
let sql=`-- Restauração de backup JSON do Super Treino Online\n-- Backup criado em: ${backup.created_at||'desconhecido'}\n-- Importação D1: sem BEGIN/COMMIT explícitos\n`;
for(const t of deleteOrder) sql+=`DELETE FROM ${t};\n`;
sql+='\n';
for(const t of order){
  const rows=Array.isArray(backup.tables[t])?backup.tables[t]:[];
  for(const row of rows){
    const cols=Object.keys(row);
    sql+=`INSERT INTO ${t} (${cols.map(c=>`"${c}"`).join(',')}) VALUES (${cols.map(c=>q(row[c])).join(',')});\n`;
  }
  sql+='\n';
}

fs.writeFileSync(output,sql,'utf8');
console.log(`SQL de restauração criado: ${output}`);
console.log('Importe com: npx wrangler d1 execute super-treino-prod --remote --file=./restaurar-backup.sql');
