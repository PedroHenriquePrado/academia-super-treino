import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const BASE = 'https://academia-super-treino.example.test';
const ref = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
class D1Mock {
  constructor(db){this.db=db;}
  prepare(sql){
    const db=this.db;
    return {
      bind(...args){
        return {
          sql,args,
          first(){return db.prepare(sql).get(...args) ?? null;},
          all(){return {results:db.prepare(sql).all(...args)};},
          run(){const stmt=db.prepare(sql); const result=stmt.run(...args);return {meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};},
          _exec(){return this.run();}
        };
      }
    };
  }
  async batch(stmts){
    this.db.exec('BEGIN');
    try{const result=stmts.map(s=>s._exec());this.db.exec('COMMIT');return result;}
    catch(e){this.db.exec('ROLLBACK');throw e;}
  }
}
async function pwHash(pass){
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},key,256);
 return `pbkdf2$100000$${Buffer.from(salt).toString('base64')}$${Buffer.from(bits).toString('base64')}`;
}
async function fixture({applyV16=true}={}){
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  if(applyV16){
    db.exec(readFileSync(new URL('../migrations/0004_observacoes_exercicios_v16.sql',import.meta.url),'utf8'));
    db.exec(readFileSync(new URL('../migrations/0005_series_cargas_v18.sql',import.meta.url),'utf8'));
  }
  db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run('Dona Teste','dona@example.test',await pwHash('Senha-antiga-com-mais-12'));
  const insert=db.prepare('INSERT INTO students(name,phone,start_date,plan_id,monthly_value,due_day,status) VALUES(?,?,?,?,?,?,?)');
  const inv=db.prepare('INSERT INTO invoices(student_id,reference_month,due_date,amount,status,paid_at,receipt_number) VALUES(?,?,?,?,?,?,?)');
  for(let i=1;i<=55;i++){
    const id=Number(insert.run(`Aluno ${i}`,`119999${String(i).padStart(5,'0')}`,'2026-01-01',1,90,23,'active').lastInsertRowid);
    const status=i<=25?'paid':'open';
    inv.run(id,ref,`${ref}-23`,90,status,status==='paid'?'2026-09-22T12:00:00':null,status==='paid'?`ST-TESTE-${id}`:null);
  }
  const before={students:db.prepare('SELECT COUNT(*) c FROM students').get().c,paid:db.prepare("SELECT COUNT(*) c FROM invoices WHERE status='paid'").get().c};
  db.exec(readFileSync(new URL('../migrations/0001_v43_seguranca.sql',import.meta.url),'utf8'));
  const env={DB:new D1Mock(db)};
  return {db,env,before};
}
async function req(env,path, {method='GET',form=null,cookie=null,origin=BASE}={}){
  const headers={};if(cookie)headers.Cookie=cookie;if(method==='POST')headers.Origin=origin;
  if(form)headers['Content-Type']='application/x-www-form-urlencoded';
  return worker.fetch(new Request(BASE+path,{method,headers,body:form?new URLSearchParams(form):undefined}),env);
}
async function loginForm(env,url=BASE+'/login') {
 const page=await worker.fetch(new Request(url),env);
 assert.equal(page.status,200);
 const html=await page.text();
 const token=html.match(/name="login_csrf_token" value="([0-9a-f]{64})"/);
 assert.ok(token,'new login page includes anti-CSRF token');
 const cookie=page.headers.get('set-cookie').split(';')[0];
 assert.match(cookie,/st_login_csrf=[0-9a-f]{64}/);
 return {cookie,token:token[1]};
}
async function login(env,email='dona@example.test',password='Senha-antiga-com-mais-12'){
 const {cookie,token}=await loginForm(env);
 const r=await req(env,'/login',{method:'POST',cookie,form:{email,password,login_csrf_token:token}});
 assert.equal(r.status,302,'login returns redirect');
 const sessionCookie=r.headers.get('set-cookie').split(';')[0];
 return sessionCookie;
}
async function csrf(env,cookie,path='/seguranca'){
 const r=await req(env,path,{cookie});assert.equal(r.status,200,`page ${path}`);
 const html=await r.text();
 const match=html.match(/name="csrf_token" value="([0-9a-f]+)"/);
 assert.ok(match,`CSRF hidden input on ${path}`);
 return {token:match[1],html};
}

function addDuplicate(db, originalId, status='archived') {
  return Number(db.prepare(`INSERT INTO students(name,phone,birth_date,start_date,plan_id,monthly_value,due_day,status)
    SELECT name,phone,birth_date,start_date,plan_id,monthly_value,due_day,? FROM students WHERE id=?`).run(status,originalId).lastInsertRowid);
}

async function duplicateForm(env,cookie,keepId,removeId) {
  const page=await req(env,`/alunos/duplicados/comparar?manter=${keepId}&excluir=${removeId}`,{cookie});
  assert.equal(page.status,200);
  const html=await page.text();
  const fingerprint=html.match(/name="fingerprint" value="([a-f0-9]{64})"/);
  const token=html.match(/name="csrf_token" value="([a-f0-9]+)"/);
  assert.ok(fingerprint);assert.ok(token);
  return {html,fields:{keep_id:String(keepId),delete_id:String(removeId),fingerprint:fingerprint[1],csrf_token:token[1],reason:'Cadastro duplicado confirmado',ack_finance:'1',confirm_text:`EXCLUIR ${removeId}`}};
}

test('duplicados lists normalized phone and name matches, including archived students, without automatically deleting anyone',async()=>{
 const {env,db}=await fixture();
 const cookie=await login(env);
 const phoneCopy=addDuplicate(db,1);
 db.prepare('UPDATE students SET name=?,phone=? WHERE id=?').run('Outro Sobrenome','(11) 9999-00001',phoneCopy);
 const nameCopy=addDuplicate(db,2);
 db.prepare('UPDATE students SET name=?,phone=? WHERE id=?').run('  ALUNO   2  ','11988880000',nameCopy);
 assert.equal((await req(env,'/alunos/duplicados')).headers.get('location'),'/login');
 const page=await req(env,'/alunos/duplicados',{cookie});
 const html=await page.text();
 assert.match(html,/Possíveis alunos duplicados/);
 assert.match(html,/Mesmo telefone/);
 assert.match(html,/Mesmo nome/);
 assert.match(html,new RegExp(`manter=1&amp;excluir=${phoneCopy}|manter=1&excluir=${phoneCopy}`));
 assert.match(html,new RegExp(`manter=2&amp;excluir=${nameCopy}|manter=2&excluir=${nameCopy}`));
 assert.equal(db.prepare('SELECT COUNT(*) c FROM students').get().c,57);
 const unrelated=await req(env,'/alunos/duplicados/comparar?manter=1&excluir=3',{cookie});
 assert.equal(unrelated.status,404);
});

test('discarding a duplicate deletes its paid invoices, access and workout records, keeping the other student and audit summary',async()=>{
 const {env,db}=await fixture();const cookie=await login(env);
 const duplicate=addDuplicate(db,1);
 db.prepare('INSERT INTO invoices(student_id,reference_month,due_date,amount,status,paid_at,receipt_number) VALUES(?,?,?,?,?,?,?)')
  .run(duplicate,ref,`${ref}-23`,90,'paid',`${ref}-16T12:00:00`,'DUP-REC-1');
 db.prepare('INSERT INTO student_workouts(student_id,template_id,assigned_at) VALUES(?,?,?)').run(duplicate,1,`${ref}-01`);
 db.prepare('INSERT INTO student_portal_accounts(student_id,password_hash) VALUES(?,?)').run(duplicate,'test-only');
 db.prepare('INSERT INTO student_exercise_checks(student_id,item_id,day) VALUES(?,?,?)').run(duplicate,1,`${ref}-12`);
 db.prepare('INSERT INTO student_exercise_sets(student_id,item_id,day,set_number,exercise_name,workout_label,completed_at) VALUES(?,?,?,?,?,?,?)')
  .run(duplicate,1,`${ref}-12`,1,'Supino','Treino A',`${ref}-12T12:00:00`);
 db.prepare('INSERT INTO student_workout_daily(student_id,workout_assignment_id,day,workout_label,template_name,total_exercises,completed_exercises,updated_at) VALUES(?,?,?,?,?,?,?,?)')
  .run(duplicate,1,`${ref}-12`,'Treino A','Teste',1,1,`${ref}-12T12:00:00`);
 const {html,fields}=await duplicateForm(env,cookie,1,duplicate);
 assert.match(html,/DUP-REC-1/);assert.match(html,/Excluir todas as mensalidades/);
 const path='/alunos/duplicados/excluir';
 assert.equal((await req(env,path,{method:'POST',cookie,form:{...fields,mode:'discard',csrf_token:''}})).status,403);
 assert.equal((await req(env,path,{method:'POST',cookie,form:{...fields,mode:'discard',confirm_text:'EXCLUIR 1'}})).status,400);
 const result=await req(env,path,{method:'POST',cookie,form:{...fields,mode:'discard'}});
 assert.equal(result.status,302);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM students WHERE id=?').get(duplicate).c,0);
 for(const table of ['invoices','student_workouts','student_portal_accounts','student_exercise_checks','student_exercise_sets','student_workout_daily'])
   assert.equal(db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE student_id=?`).get(duplicate).c,0,table);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM students WHERE id=1').get().c,1);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM invoices WHERE student_id=1 AND status='paid'").get().c,1);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='aluno_duplicado_excluido' AND entity_id=1").get().c,1);
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('preserve mode moves unique paid invoices and replaces an open invoice; stale comparison never deletes',async()=>{
 const {env,db}=await fixture();const cookie=await login(env);
 const duplicate=addDuplicate(db,30);
 const previous=ref.endsWith('-01')?`${Number(ref.slice(0,4))-1}-12`:`${ref.slice(0,4)}-${String(Number(ref.slice(5))-1).padStart(2,'0')}`;
 db.prepare('INSERT INTO invoices(student_id,reference_month,due_date,amount,status,paid_at,receipt_number) VALUES(?,?,?,?,?,?,?)')
  .run(duplicate,ref,`${ref}-23`,105,'paid',`${ref}-14T12:00:00`,'REAL-ATUAL');
 db.prepare('INSERT INTO invoices(student_id,reference_month,due_date,amount,status,paid_at,receipt_number) VALUES(?,?,?,?,?,?,?)')
  .run(duplicate,previous,`${previous}-23`,75,'paid',`${ref}-14T12:00:00`,'REAL-ANTERIOR');
 const before=await duplicateForm(env,cookie,30,duplicate);
 assert.match(before.html,/Preservar pagamentos e mensalidades/);
 db.prepare('UPDATE invoices SET amount=95 WHERE student_id=30 AND reference_month=?').run(ref);
 const path='/alunos/duplicados/excluir';
 assert.equal((await req(env,path,{method:'POST',cookie,form:{...before.fields,mode:'preserve'}})).status,409);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM students WHERE id=?').get(duplicate).c,1);
 const refreshed=await duplicateForm(env,cookie,30,duplicate);
 assert.equal((await req(env,path,{method:'POST',cookie,form:{...refreshed.fields,mode:'preserve'}})).status,302);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM students WHERE id=?').get(duplicate).c,0);
 const paid=db.prepare("SELECT receipt_number FROM invoices WHERE student_id=30 AND status='paid' ORDER BY reference_month").all();
 assert.deepEqual(paid.map(i=>i.receipt_number),['REAL-ANTERIOR','REAL-ATUAL']);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices WHERE student_id=30 AND reference_month=?').get(ref).c,1);
 assert.equal((await req(env,`/recibos/${db.prepare("SELECT id FROM invoices WHERE receipt_number='REAL-ATUAL'").get().id}`,{cookie})).status,200);
 assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('two paid invoices for the same reference month block preserve mode; no rows change',async()=>{
 const {env,db}=await fixture();const cookie=await login(env);
 const duplicate=addDuplicate(db,1);
 db.prepare('INSERT INTO invoices(student_id,reference_month,due_date,amount,status,paid_at,receipt_number) VALUES(?,?,?,?,?,?,?)')
  .run(duplicate,ref,`${ref}-23`,90,'paid',`${ref}-12T12:00:00`,'DUP-REC-2');
 const {html,fields}=await duplicateForm(env,cookie,1,duplicate);
 assert.match(html,/dois cadastros/);
 assert.match(html,/value="preserve" required disabled/);
 assert.equal((await req(env,'/alunos/duplicados/excluir',{method:'POST',cookie,form:{...fields,mode:'preserve'}})).status,409);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM students WHERE id=?').get(duplicate).c,1);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM invoices WHERE status='paid'").get().c,26);
});

test('an error during the final deletion rolls back invoices and student data together',async()=>{
 const {env,db}=await fixture();const cookie=await login(env);
 const duplicate=addDuplicate(db,1);
 db.prepare('INSERT INTO invoices(student_id,reference_month,due_date,amount,status,paid_at,receipt_number) VALUES(?,?,?,?,?,?,?)')
  .run(duplicate,ref,`${ref}-23`,90,'paid',`${ref}-11T12:00:00`,'ROLLBACK-REC');
 const {fields}=await duplicateForm(env,cookie,1,duplicate);
 db.exec(`CREATE TRIGGER abort_student_delete BEFORE DELETE ON students BEGIN SELECT RAISE(ABORT,'simulated failure'); END;`);
 const oldError=console.error;let result;
 try { console.error=()=>{};result=await req(env,'/alunos/duplicados/excluir',{method:'POST',cookie,form:{...fields,mode:'discard'}}); }
 finally { console.error=oldError; }
 assert.equal(result.status,409);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM students WHERE id=?').get(duplicate).c,1);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM invoices WHERE receipt_number='ROLLBACK-REC'").get().c,1);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='aluno_duplicado_excluido'").get().c,0);
});

test('migration on existing 55 students preserves all old invoices and paid receipts', async()=>{
 const {db,before}=await fixture();
 assert.deepEqual(before,{students:55,paid:25});
 assert.equal(db.prepare('SELECT COUNT(*) c FROM students').get().c,55);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM invoices WHERE status='paid'").get().c,25);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices WHERE receipt_number IS NOT NULL').get().c,25);
 assert.equal(db.prepare('SELECT is_active FROM users WHERE id=1').get().is_active,1);
});

test('login, dark theme, CSRF protection on every authenticated POST', async()=>{
 const {env}=await fixture();
 const cookie=await login(env);const {token,html}=await csrf(env,cookie,'/alunos/novo');
 assert.match(html,/super-treino-theme/);
 assert.match(html,/value="[0-9a-f]+"/);
 const unprotected=await req(env,'/seguranca/usuarios',{method:'POST',cookie,form:{name:'Tester',email:'tester@example.test',password:'bom-passe-123456',confirm_password:'bom-passe-123456'}});
 assert.equal(unprotected.status,403);
 const evil=await req(env,'/seguranca/usuarios',{method:'POST',cookie,origin:'https://evil.example',form:{csrf_token:token}});
 assert.equal(evil.status,403);
});

test('second owner must change temporary password and can be disabled without harming first owner',async()=>{
 const {env,db}=await fixture();const adminCookie=await login(env);const {token}=await csrf(env,adminCookie);
 const created=await req(env,'/seguranca/usuarios',{method:'POST',cookie:adminCookie,form:{csrf_token:token,name:'Segundo dono',email:'segundo@example.test',password:'senha-provisoria-123',confirm_password:'senha-provisoria-123'}});
 assert.equal(created.status,302);
 const second= db.prepare('SELECT * FROM users WHERE email=?').get('segundo@example.test');
 assert.equal(second.must_change_password,1);
 const secondCookie=await login(env,'segundo@example.test','senha-provisoria-123');
 let portal=await req(env,'/',{cookie:secondCookie});assert.equal(portal.status,302);assert.equal(portal.headers.get('location'),'/conta/primeiro-acesso');
 const changeForm=await csrf(env,secondCookie,'/conta/primeiro-acesso');
 const change=await req(env,'/conta/primeiro-acesso',{method:'POST',cookie:secondCookie,form:{csrf_token:changeForm.token,current_password:'senha-provisoria-123',password:'nova-senha-forte-789',confirm_password:'nova-senha-forte-789'}});
 assert.equal(change.status,302);
 const newCookie=await login(env,'segundo@example.test','nova-senha-forte-789');
 portal=await req(env,'/',{cookie:newCookie});assert.equal(portal.status,200);
 const adminCsrf=await csrf(env,adminCookie);
 const selfDisable=await req(env,'/seguranca/usuarios/1/desativar',{method:'POST',cookie:adminCookie,form:{csrf_token:adminCsrf.token}});
 assert.equal(selfDisable.status,400);
 const disable=await req(env,`/seguranca/usuarios/${second.id}/desativar`,{method:'POST',cookie:adminCookie,form:{csrf_token:adminCsrf.token}});
 assert.equal(disable.status,302);
 assert.equal(db.prepare('SELECT is_active FROM users WHERE id=?').get(second.id).is_active,0);
 assert.equal((await req(env,'/',{cookie:newCookie})).status,302);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM users WHERE is_active=1').get().c,1);
});

test('payment submitted twice only pays once; actor in audit log and old paid receipts remain unchanged',async()=>{
 const {env,db}=await fixture(); const cookie=await login(env);const {token}=await csrf(env,cookie,'/mensalidades');
 const invoice=db.prepare('SELECT id FROM invoices WHERE student_id=30').get().id;
 const pay=()=>req(env,`/mensalidades/${invoice}/pagar`,{method:'POST',cookie,form:{csrf_token:token,payment_method:'Pix'}});
 assert.equal((await pay()).status,302);
 const first=db.prepare('SELECT paid_at,receipt_number FROM invoices WHERE id=?').get(invoice);
 assert.ok(first.paid_at);assert.ok(first.receipt_number);
 assert.equal((await pay()).status,302);
 assert.deepEqual(db.prepare('SELECT paid_at,receipt_number FROM invoices WHERE id=?').get(invoice),first);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='pagamento_confirmado' AND entity_id=?").get(invoice).c,1);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM invoices WHERE status='paid'").get().c,26);
});

test('administrator can undo one test payment with reason without affecting other paid receipts',async()=>{
 const {env,db}=await fixture();const cookie=await login(env);const {token}=await csrf(env,cookie,'/mensalidades');
 const invoice=db.prepare('SELECT id FROM invoices WHERE student_id=30').get().id;
 const beforeCount=db.prepare('SELECT COUNT(*) c FROM invoices').get().c;
 const other=db.prepare('SELECT * FROM invoices WHERE student_id=1').get();
 const pay=await req(env,`/mensalidades/${invoice}/pagar`,{method:'POST',cookie,form:{csrf_token:token,payment_method:'Pix'}});
 assert.equal(pay.status,302);
 const receipt=await (await req(env,`/recibos/${invoice}`,{cookie})).text();
 assert.match(receipt,/Corrigir pagamento lançado por engano/);
 assert.match(receipt,new RegExp(`/mensalidades/${invoice}/desfazer-pagamento`));
 const undoPath=`/mensalidades/${invoice}/desfazer-pagamento`;
 const forged=await req(env,undoPath,{method:'POST',cookie,form:{reason:'lançamento de teste'}});
 assert.equal(forged.status,403);
 const noReason=await req(env,undoPath,{method:'POST',cookie,form:{csrf_token:token,reason:'x'}});
 assert.equal(noReason.status,400);
 const undo=await req(env,undoPath,{method:'POST',cookie,form:{csrf_token:token,reason:'lançamento de teste'}});
 assert.equal(undo.status,302);
 assert.deepEqual({...db.prepare('SELECT status,paid_at,payment_method,receipt_number FROM invoices WHERE id=?').get(invoice)},{status:'open',paid_at:null,payment_method:null,receipt_number:null});
 assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices').get().c,beforeCount);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM invoices WHERE status='paid'").get().c,25);
 assert.deepEqual(db.prepare('SELECT * FROM invoices WHERE student_id=1').get(),other);
 const audit=db.prepare("SELECT old_data,new_data,description FROM audit_log WHERE entity_id=? AND action='pagamento_desfeito'").get(invoice);
 assert.match(audit.description,/lançamento de teste/);
 assert.ok(JSON.parse(audit.old_data).receipt_number);
 assert.equal(JSON.parse(audit.new_data).status,'open');
 assert.equal((await req(env,`/recibos/${invoice}`,{cookie})).status,404);
 assert.equal((await req(env,undoPath,{method:'POST',cookie,form:{csrf_token:token,reason:'lançamento de teste'}})).status,302);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE entity_id=? AND action='pagamento_desfeito'").get(invoice).c,1);
});

test('anulling one fake monthly charge removes paid and receivable totals while keeping an audit record',async()=>{
 const {env,db}=await fixture();const admin=await login(env);const {token}=await csrf(env,admin,'/mensalidades');
 const invoice=db.prepare('SELECT id FROM invoices WHERE student_id=30').get().id;
 const oldReceipt=db.prepare('SELECT receipt_number FROM invoices WHERE student_id=1').get().receipt_number;
 assert.equal((await req(env,`/mensalidades/${invoice}/pagar`,{method:'POST',cookie:admin,form:{csrf_token:token,payment_method:'Pix'}})).status,302);
 const portalStudent=await activeStudentCookie(env,admin,30);
 const before=await (await req(env,'/app/mensalidade',{cookie:portalStudent.cookie})).text();
 assert.match(before,/Último pagamento registrado/);
 const receipt=await (await req(env,`/recibos/${invoice}`,{cookie:admin})).text();
 assert.match(receipt,/Anular lançamento indevido/);
 assert.match(receipt,new RegExp(`/mensalidades/${invoice}/anular-teste`));
 const path=`/mensalidades/${invoice}/anular-teste`;
 assert.equal((await req(env,path,{method:'POST',cookie:admin,form:{reason:'matrícula de teste'}})).status,403);
 assert.equal((await req(env,path,{method:'POST',cookie:admin,form:{csrf_token:token,reason:'x'}})).status,400);
 assert.equal((await req(env,path,{method:'POST',cookie:admin,form:{csrf_token:token,reason:'matrícula de teste'}})).status,302);
 assert.equal(db.prepare('SELECT status FROM invoices WHERE id=?').get(invoice).status,'cancelled');
 assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices').get().c,55);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM invoices WHERE status='paid'").get().c,25);
 assert.equal(db.prepare("SELECT SUM(amount) total FROM invoices WHERE status='open'").get().total,29*90);
 assert.equal(db.prepare("SELECT SUM(amount) total FROM invoices WHERE status='paid'").get().total,25*90);
 assert.equal(db.prepare('SELECT receipt_number FROM invoices WHERE student_id=1').get().receipt_number,oldReceipt);
 const audit=db.prepare("SELECT old_data,new_data FROM audit_log WHERE entity_id=? AND action='cobranca_anulada'").get(invoice);
 assert.ok(JSON.parse(audit.old_data).receipt_number);
 assert.equal(JSON.parse(audit.new_data).status,'cancelled');
 assert.equal((await req(env,`/recibos/${invoice}`,{cookie:admin})).status,404);
 assert.equal((await req(env,`/mensalidades/${invoice}/pagar`,{method:'POST',cookie:admin,form:{csrf_token:token,payment_method:'Pix'}})).status,409);
 const billing=await (await req(env,'/app/mensalidade',{cookie:portalStudent.cookie})).text();
 assert.doesNotMatch(billing,/Último pagamento registrado/);
 assert.match(billing,/Nenhuma cobrança registrada para este mês/);
 const adminList=await (await req(env,'/mensalidades',{cookie:admin})).text();
 assert.ok(!adminList.includes(`/recibos/${invoice}`));
 assert.equal((await req(env,'/',{cookie:admin})).status,200);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices').get().c,55,'automatic billing does not reissue this cancelled month');
 assert.equal((await req(env,path,{method:'POST',cookie:admin,form:{csrf_token:token,reason:'matrícula de teste'}})).status,302);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE entity_id=? AND action='cobranca_anulada'").get(invoice).c,1);
});

test('finance ledger groups by actual payment month and separates open invoices',async()=>{
 const {db,env}=await fixture(),admin=await login(env),{token}=await csrf(env,admin,'/mensalidades');
 const [year,month]=ref.split('-').map(Number);
 const previousDate=new Date(Date.UTC(year,month-2,2));
 const previous=`${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth()+1).padStart(2,'0')}`;
 db.prepare("UPDATE invoices SET paid_at=? WHERE status='paid'").run(`${previous}-15T10:00:00`);
 const first=await (await req(env,'/mensalidades',{cookie:admin})).text();
 assert.match(first,/Pagos no mês/);
 assert.match(first,/Nenhum pagamento registrado neste mês/);
 assert.doesNotMatch(first,/Vence em 3 dias/);
 const older=await (await req(env,`/mensalidades?mes=${previous}&status=paid`,{cookie:admin})).text();
 assert.match(older,/25 pagamento\(s\)/);
 assert.match(older,/2\.250,00/);
 assert.match(older,/Data do pagamento/);
 const id=db.prepare('SELECT id FROM invoices WHERE student_id=30').get().id;
 assert.equal((await req(env,`/mensalidades/${id}/pagar`,{method:'POST',cookie:admin,form:{csrf_token:token,payment_method:'Pix'}})).status,302);
 const current=await (await req(env,`/mensalidades?mes=${ref}&status=paid`,{cookie:admin})).text();
 assert.match(current,/1 pagamento\(s\)/);
 assert.match(current,/R\$\s*90,00/);
 assert.match(current,/Aluno 30/);
 assert.doesNotMatch(current,/Aluno 1</);
 const open=await (await req(env,`/mensalidades?mes=${ref}&status=all`,{cookie:admin})).text();
 assert.match(open,/A receber/);
 assert.match(open,/Aluno 31/);
 assert.doesNotMatch(open,/Aluno 30</);
 assert.match(open,/Total de cobranças nesta lista/);
});

test('an erroneous unpaid invoice can be annulled without creating a fake receipt',async()=>{
 const {db,env}=await fixture(),admin=await login(env),{token}=await csrf(env,admin,'/mensalidades');
 const id=db.prepare('SELECT id FROM invoices WHERE student_id=30').get().id;
 const other=db.prepare('SELECT status,receipt_number FROM invoices WHERE student_id=1').get();
 const row=await (await req(env,`/mensalidades?mes=${ref}&status=all`,{cookie:admin})).text();
 assert.match(row,new RegExp(`/mensalidades/${id}/anular-teste`));
 const action=`/mensalidades/${id}/anular-teste`;
 assert.equal((await req(env,action,{method:'POST',cookie:admin,form:{reason:'lançamento duplicado'}})).status,403);
 assert.equal((await req(env,action,{method:'POST',cookie:admin,form:{csrf_token:token,reason:'lançamento duplicado'}})).status,302);
 assert.equal(db.prepare('SELECT status FROM invoices WHERE id=?').get(id).status,'cancelled');
 assert.deepEqual(db.prepare('SELECT status,receipt_number FROM invoices WHERE student_id=1').get(),other);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE entity_id=? AND action='cobranca_anulada'").get(id).c,1);
 const afterwards=await (await req(env,`/mensalidades?mes=${ref}&status=all`,{cookie:admin})).text();
 assert.ok(!afterwards.includes(`/mensalidades/${id}/pagar`));
 assert.equal((await req(env,'/',{cookie:admin})).status,200);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices WHERE student_id=30').get().c,1);
});

test('archiving and reactivating a student leaves all invoices, paid receipts and workout links untouched',async()=>{
 const {env,db}=await fixture(); const cookie=await login(env);const {token}=await csrf(env,cookie,'/alunos/1');
 db.prepare('INSERT INTO student_workouts(student_id,template_id,assigned_at,active) VALUES(1,1,?,1)').run('2026-09-23');
 const before=db.prepare('SELECT * FROM invoices WHERE student_id=1').get();
 const a=await req(env,'/alunos/1/arquivar',{method:'POST',cookie,form:{csrf_token:token}});
 assert.equal(a.status,302);
 assert.equal(db.prepare('SELECT status FROM students WHERE id=1').get().status,'archived');
 assert.deepEqual(db.prepare('SELECT * FROM invoices WHERE student_id=1').get(),before);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM student_workouts WHERE student_id=1').get().c,1);
 const arch=await req(env,'/alunos?status=archived',{cookie});assert.match(await arch.text(),/Aluno 1/);
 const react=await req(env,'/alunos/1/reativar',{method:'POST',cookie,form:{csrf_token:token}});
 assert.equal(react.status,302);
 assert.equal(db.prepare('SELECT status FROM students WHERE id=1').get().status,'active');
 assert.deepEqual(db.prepare('SELECT * FROM invoices WHERE student_id=1').get(),before);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE entity_type='aluno' AND entity_id=1").get().c,2);
});

test('editing a student audits open-invoice amount changes but never rewrites a paid invoice',async()=>{
 const {env,db}=await fixture();const cookie=await login(env);const {token}=await csrf(env,cookie,'/alunos/30/editar');
 const action='/alunos/30/editar';
 const fields={csrf_token:token,name:'Aluno 30',phone:'11999900030',start_date:'2026-01-01',plan_id:'1',monthly_value:'110',due_day:'24',status:'active'};
 const response=await req(env,action,{method:'POST',cookie,form:fields});assert.equal(response.status,302);
 let invoice=db.prepare('SELECT id,amount,due_date,status FROM invoices WHERE student_id=30').get();
 assert.equal(invoice.amount,110);assert.equal(invoice.due_date,`${ref}-24`);
 assert.equal(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='cobranca_ajustada' AND entity_id=?").get(invoice.id).c,1);
 const payment=await req(env,`/mensalidades/${invoice.id}/pagar`,{method:'POST',cookie,form:{csrf_token:token,payment_method:'Pix'}});assert.equal(payment.status,302);
 const paid=db.prepare('SELECT * FROM invoices WHERE id=?').get(invoice.id);
 const editAgain=await req(env,action,{method:'POST',cookie,form:{...fields,monthly_value:'130',due_day:'25'}});assert.equal(editAgain.status,302);
 assert.deepEqual(db.prepare('SELECT * FROM invoices WHERE id=?').get(invoice.id),paid);
});

test('an administrator can issue temporary password reset; all the target sessions are revoked',async()=>{
 const {env,db}=await fixture();const cookie=await login(env);const {token}=await csrf(env,cookie);
 const create=await req(env,'/seguranca/usuarios',{method:'POST',cookie,form:{csrf_token:token,name:'Dono 2',email:'dono2@example.test',password:'senha-inicial-123',confirm_password:'senha-inicial-123'}});
 assert.equal(create.status,302);
 const otherCookie=await login(env,'dono2@example.test','senha-inicial-123');
 const reset=await req(env,'/seguranca/usuarios/2/redefinir',{method:'POST',cookie,form:{csrf_token:token,password:'senha-redefinida-123',confirm_password:'senha-redefinida-123'}});
 assert.equal(reset.status,302);
 assert.equal((await req(env,'/',{cookie:otherCookie})).status,302);
 const updated=await login(env,'dono2@example.test','senha-redefinida-123');
 const forced=await req(env,'/',{cookie:updated});assert.equal(forced.headers.get('location'),'/conta/primeiro-acesso');
 assert.equal(db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='senha_redefinida'").get().c,1);
});


test('public login form sets a host-only CSRF cookie and allows private mobile POST with correct token',async()=>{
 const {env}=await fixture();
 const page=await worker.fetch(new Request(BASE+'/login'),env);
 const cookieHeader=page.headers.get('set-cookie');
 assert.match(cookieHeader,/__Host-st_login_csrf=[0-9a-f]{64}/);
 assert.match(cookieHeader,/HttpOnly/);
 assert.match(cookieHeader,/SameSite=Strict/);
 assert.match(cookieHeader,/Secure/);
 assert.doesNotMatch(cookieHeader,/Domain=/i);
 const token=(await page.text()).match(/name="login_csrf_token" value="([0-9a-f]{64})"/)[1];
 const cookie=cookieHeader.split(';')[0];
 const form=new URLSearchParams({email:'dona@example.test',password:'Senha-antiga-com-mais-12',login_csrf_token:token});
 const send=headers=>worker.fetch(new Request(BASE+'/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Cookie:cookie,...headers},body:form}),env);
 const privateBrave=await send({'Origin':'null','Sec-Fetch-Site':'none'});
 assert.equal(privateBrave.status,302,'mobile Brave must log in with a real first-party form');
 assert.match(privateBrave.headers.get('set-cookie'),/session=/);
 assert.equal((await send({})).status,302,'missing all origin headers with valid token works');
 assert.equal((await send({'Origin':'https://evil.example'})).status,403,'explicit foreign origin remains blocked');
 assert.equal((await send({'Referer':'https://evil.example/attack'})).status,403,'foreign referer remains blocked');
});

test('login CSRF protects production against cross-site, missing-cookie, missing-token and mismatched-token requests', async()=>{
 const {env,db}=await fixture();
 const {cookie,token}=await loginForm(env);
 const post=(headers,posted=token)=>worker.fetch(new Request(BASE+'/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams({email:'dona@example.test',password:'Senha-antiga-com-mais-12',login_csrf_token:posted})}),env);
 assert.equal((await post({'Origin':'https://evil.example',Cookie:cookie})).status,403);
 assert.equal((await post({'Sec-Fetch-Site':'cross-site'})).status,403,'forged request lacks first-party cookie');
 assert.equal((await post({Cookie:cookie},'')).status,403);
 assert.equal((await post({Cookie:cookie},'0'.repeat(64))).status,403);
 assert.equal((await post({})).status,403);
 assert.equal(db.prepare('SELECT COUNT(*) c FROM sessions').get().c,0);
 const valid=await post({Cookie:cookie,'Sec-Fetch-Site':'same-origin'});
 assert.equal(valid.status,302);
});

test('local HTTP dev setup works despite privacy/proxy origin changes; public HTTPS still blocks outside origins', async()=>{
  async function check(url, headers, allowed){
    const {env}=await fixture();
    env.SETUP_KEY='chave-local-teste-super-segura';
    const form=new URLSearchParams({
      setup_key:env.SETUP_KEY,name:'Teste Local',email:'local@example.test',
      password:'senha-ficticia-local-forte-123',confirm_password:'senha-ficticia-local-forte-123'
    });
    const r=await worker.fetch(new Request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...headers},body:form}),env);
    const body=await r.text();
    if(allowed) assert.equal(r.status,302,`expected local setup to succeed: ${body}`);
    else assert.equal(r.status,403,'cross-site form must remain forbidden');
  }
  const local='http://127.0.0.1:8787/setup';
  await check(local,{'Origin':'http://127.0.0.1:8787','Sec-Fetch-Site':'same-origin'},true);
  await check(local,{'Origin':'http://localhost:8787','Sec-Fetch-Site':'cross-site'},true);
  await check(local,{},true);
  await check(local,{'Sec-Fetch-Site':'cross-site'},true);
  // Local-only setup uses the secret key as authorization, regardless of
  // browser origin headers. This bypass is NEVER available on public HTTPS.
  await check(local,{'Origin':'https://evil.example','Sec-Fetch-Site':'cross-site'},true);
  await check(local,{'Origin':'null','Sec-Fetch-Site':'same-origin'},true);
  await check('https://academia-super-treino.workers.dev/setup',{},false);
  await check('https://academia-super-treino.workers.dev/setup',{'Origin':'http://localhost:8787'},false);
});


test('development origin fallback does not remove setup-key requirement or authenticated CSRF; HTTPS always checks origin', async()=>{
  const {env,db}=await fixture();
  env.SETUP_KEY='chave-local-longa-apenas-para-testes-abc123';
  db.exec('DELETE FROM users');
  const setup = form => worker.fetch(new Request('http://127.0.0.1:8787/setup',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Origin':'null', 'Sec-Fetch-Site':'cross-site'},
    body: new URLSearchParams({name:'Dona Local',email:'local@example.test',password:'senha-super-forte-local-98765',confirm_password:'senha-super-forte-local-98765',...form})
  }),env);
  const bad=await setup({setup_key:'chave-errada'});
  assert.equal(bad.status,403,'local setup still checks the secret');
  const good=await setup({setup_key:env.SETUP_KEY});
  assert.equal(good.status,302,'local setup succeeds with valid key');
  const loginSeed=await loginForm(env,'http://127.0.0.1:8787/login');
  const loginRes=await worker.fetch(new Request('http://127.0.0.1:8787/login',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Origin':'null','Cookie':loginSeed.cookie},
    body:new URLSearchParams({email:'local@example.test',password:'senha-super-forte-local-98765',login_csrf_token:loginSeed.token})
  }),env);
  assert.equal(loginRes.status,302,'local login works even with privacy-rewritten Origin');
  const cookie=loginRes.headers.get('set-cookie').split(';')[0];
  const blocked=await worker.fetch(new Request('http://127.0.0.1:8787/seguranca/usuarios',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Origin':'null','Cookie':cookie},
    body:new URLSearchParams({name:'Ataque',email:'ataque@example.test',password:'senha-super-forte-98765',confirm_password:'senha-super-forte-98765'})
  }),env);
  assert.equal(blocked.status,403,'local authenticated POST still requires CSRF token');
  const denied=await worker.fetch(new Request('https://academia-super-treino.example.test/login',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Origin':'null'},
    body:new URLSearchParams({email:'local@example.test',password:'senha-super-forte-local-98765'})
  }),env);
  assert.equal(denied.status,403,'public HTTPS still rejects null origin');
});


test('mobile Brave logout accepts valid session CSRF even without Origin/Referer; invalid or forged logout stays blocked', async()=>{
  const {env,db}=await fixture();
  const cookie=await login(env);
  const {token,html}=await csrf(env,cookie,'/');
  assert.match(html, /class="logout-form" method="post" action="\/logout"/);
  const logoutForm=(csrf,headers={})=>worker.fetch(new Request(BASE+'/logout',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Cookie':cookie,...headers},
    body:new URLSearchParams({csrf_token:csrf})
  }),env);
  // O mesmo bloqueio observado no Android não deve ser contornado SEM o token.
  const forged=await logoutForm('',{'Origin':'https://evil.example','Sec-Fetch-Site':'cross-site'});
  assert.equal(forged.status,403);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM sessions').get().c,1);
  const wrong=await logoutForm('token-invalido',{'Sec-Fetch-Site':'none'});
  assert.equal(wrong.status,403);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM sessions').get().c,1);
  // Brave/Android: no-referrer e cabeçalhos de origem ausentes ou opacos.
  const signedOut=await logoutForm(token,{'Origin':'null','Sec-Fetch-Site':'none'});
  assert.equal(signedOut.status,302);
  assert.equal(signedOut.headers.get('location'),'/login');
  assert.match(signedOut.headers.get('set-cookie'),/session=;.*Max-Age=0/);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM sessions').get().c,0);
  const after=await req(env,'/',{cookie});
  assert.equal(after.status,302);
  assert.equal(after.headers.get('location'),'/login');
  // Alguns navegadores simplesmente omitem os três cabeçalhos.
  const cookieNoHeaders=await login(env);
  const {token:tokenNoHeaders}=await csrf(env,cookieNoHeaders,'/');
  const withoutOrigin=await worker.fetch(new Request(BASE+'/logout',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Cookie':cookieNoHeaders},
    body:new URLSearchParams({csrf_token:tokenNoHeaders})
  }),env);
  assert.equal(withoutOrigin.status,302);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM sessions').get().c,0);
});

test('authenticated mobile form with valid CSRF works despite missing or opaque origin; foreign sites remain blocked',async()=>{
  const {env,db}=await fixture();
  const cookie=await login(env);
  const {token}=await csrf(env,cookie);
  const post=(csrf,headers={})=>worker.fetch(new Request(BASE+'/seguranca/usuarios',{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Cookie':cookie,...headers},
    body:new URLSearchParams({csrf_token:csrf,name:'Segundo teste',email:'x@example.test',password:'senha-muito-longa-1234',confirm_password:'senha-muito-longa-1234'})
  }),env);
  assert.equal((await post('')).status,403,'missing token denied even without origin');
  assert.equal((await post(token,{'Origin':'https://evil.example'})).status,403,'explicit foreign origin denied even with token');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c,1);
  assert.equal((await post(token,{'Origin':'null','Sec-Fetch-Site':'none'})).status,302,'mobile Brave first-party form works');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM users').get().c,2);
});

test('exercise library hidden state overrides grid display so search and muscle filters work',()=>{
  const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
  assert.match(css,/\.exercise-library-item\[hidden\][\s\S]*display\s*:\s*none\s*!important/);
});

// V1.2 — testes de integração: atribuição e portal do aluno isolado.
async function portalLoginForm(env){
  const r=await req(env,'/app/entrar');assert.equal(r.status,200);
  const html=await r.text();
  const token=html.match(/name="portal_login_csrf" value="([a-f0-9]{64})"/);
  assert.ok(token,'student login includes independent anti-CSRF token');
  return {cookie:r.headers.get('set-cookie').split(';')[0],token:token[1]};
}
async function createStudentAccess(env,adminCookie,studentId=1){
  const {token}=await csrf(env,adminCookie,`/alunos/${studentId}/acesso`);
  const r=await req(env,`/alunos/${studentId}/acesso/gerar`,{method:'POST',cookie:adminCookie,form:{csrf_token:token}});
  assert.equal(r.status,200);
  const body=await r.text(),pass=body.match(/class="portal-temp-password">([^<]+)</);
  assert.ok(pass,'one-time provisional password shown to teacher');
  return pass[1];
}
async function studentLogin(env,id,pass){
  const {cookie,token}=await portalLoginForm(env);
  const r=await req(env,'/app/entrar',{method:'POST',cookie,form:{student_id:id,password:pass,portal_login_csrf:token}});
  assert.equal(r.status,302);
  assert.ok(['/app/senha','/app'].includes(r.headers.get('location')));
  return {cookie:r.headers.get('set-cookie').split(';')[0],location:r.headers.get('location')};
}

test('V1.2 migration is additive and keeps 55 students, 25 receipts and existing workout models',async()=>{
  const {db,before}=await fixture();
  const workouts=db.prepare('SELECT COUNT(*) c FROM workout_templates').get().c;
  db.exec(readFileSync(new URL('../migrations/0002_portal_aluno_v12.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0002_portal_aluno_v12.sql',import.meta.url),'utf8'));
  assert.deepEqual(before,{students:55,paid:25});
  assert.equal(db.prepare('SELECT COUNT(*) c FROM students').get().c,55);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM invoices WHERE status='paid'").get().c,25);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM workout_templates').get().c,workouts);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_portal_accounts').get().c,0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_exercise_checks').get().c,0);
});

test('V1.2 teacher can assign from workout detail, preview independently and preserve paid invoices',async()=>{
  const {env,db}=await fixture(),cookie=await login(env);
  const workout=await csrf(env,cookie,'/treinos/1');
  assert.match(workout.html,/Atribuir esta ficha a um aluno/);
  const originalInvoice=db.prepare('SELECT * FROM invoices WHERE student_id=1').get();
  const r=await req(env,'/treinos/1/atribuir',{method:'POST',cookie,form:{csrf_token:workout.token,student_id:1,notes:'Executar devagar'}});
  assert.equal(r.status,302);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_workouts WHERE student_id=1 AND active=1').get().c,1);
  assert.deepEqual(db.prepare('SELECT * FROM invoices WHERE student_id=1').get(),originalInvoice);
  const preview=await req(env,'/alunos/1/previa',{cookie});
  assert.equal(preview.status,200);
  const html=await preview.text();
  assert.match(html,/PRÉVIA DO PROFESSOR/);assert.match(html,/Supino reto/);
  assert.doesNotMatch(html,/action="\/app\/exercicios/,'preview cannot modify student completion');
  assert.equal((await req(env,'/alunos/1/previa')).status,302,'anonymous preview is blocked');
  const second=await req(env,'/treinos/2/atribuir',{method:'POST',cookie,form:{csrf_token:workout.token,student_id:1}});
  assert.equal(second.status,302);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_workouts WHERE student_id=1 AND active=1').get().c,1);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_workouts WHERE student_id=1').get().c,2);
  assert.equal(db.prepare('SELECT template_id FROM student_workouts WHERE student_id=1 AND active=1').get().template_id,2);
  assert.deepEqual(db.prepare('SELECT * FROM invoices WHERE student_id=1').get(),originalInvoice);
});

test('V1.2 student portal requires student credentials, own CSRF and first-login password change',async()=>{
  const {env,db}=await fixture(),admin=await login(env);
  const adminCsrf=(await csrf(env,admin,'/alunos/1')).token;
  assert.equal((await req(env,'/alunos/1/treino',{method:'POST',cookie:admin,form:{csrf_token:adminCsrf,template_id:1}})).status,302);
  const provisional=await createStudentAccess(env,admin);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_portal_accounts').get().c,1);
  assert.doesNotMatch(db.prepare('SELECT password_hash FROM student_portal_accounts WHERE student_id=1').get().password_hash,new RegExp(provisional));
  assert.equal((await req(env,'/app')).status,302,'anonymous student cannot see exercises');
  const form=await portalLoginForm(env);
  assert.equal((await req(env,'/app/entrar',{method:'POST',cookie:form.cookie,form:{student_id:1,password:provisional}})).status,403,'portal login enforces own CSRF');
  assert.equal((await req(env,'/app/entrar',{method:'POST',cookie:form.cookie,origin:'https://evil.example',form:{student_id:1,password:provisional,portal_login_csrf:form.token}})).status,403);
  const {cookie,location}=await studentLogin(env,1,provisional);assert.equal(location,'/app/senha');
  assert.equal((await req(env,'/app',{cookie})).headers.get('location'),'/app/senha');
  const first=await req(env,'/app/senha',{cookie}); const firstHtml=await first.text();
  const csrfToken=firstHtml.match(/name="csrf_token" value="([a-f0-9]+)"/)[1];
  assert.equal((await req(env,'/app/senha',{method:'POST',cookie,form:{old_password:provisional,password:'Senha-forte-nova-2026',confirm_password:'Senha-forte-nova-2026'}})).status,403,'password changes need own CSRF');
  const change=await req(env,'/app/senha',{method:'POST',cookie,form:{csrf_token:csrfToken,old_password:provisional,password:'Senha-forte-nova-2026',confirm_password:'Senha-forte-nova-2026'}});
  assert.equal(change.status,302);assert.equal(change.headers.get('location'),'/app');
  assert.equal(db.prepare('SELECT must_change_password FROM student_portal_accounts WHERE student_id=1').get().must_change_password,0);
  const app=await req(env,'/app',{cookie});assert.equal(app.status,200);
  const html=await app.text();assert.match(html,/Supino reto/);assert.match(html,/Treino A/);
  assert.doesNotMatch(html,/11999900001|Mensalidades|Recebimentos|Recibo/,'student area never displays administrative data');
});

test('V1.2 student can only tick an exercise from their own active sheet; revocation ends session',async()=>{
  const {env,db}=await fixture(),admin=await login(env);
  const adminCsrf=(await csrf(env,admin,'/alunos/1')).token;
  await req(env,'/alunos/1/treino',{method:'POST',cookie:admin,form:{csrf_token:adminCsrf,template_id:1}});
  const provisional=await createStudentAccess(env,admin),{cookie}=await studentLogin(env,1,provisional);
  const pwHtml=await (await req(env,'/app/senha',{cookie})).text();
  const token=pwHtml.match(/name="csrf_token" value="([a-f0-9]+)"/)[1];
  await req(env,'/app/senha',{method:'POST',cookie,form:{csrf_token:token,old_password:provisional,password:'Senha-aluno-segura-123',confirm_password:'Senha-aluno-segura-123'}});
  const item=db.prepare('SELECT id FROM workout_template_items WHERE template_id=1 ORDER BY id LIMIT 1').get().id;
  const foreign=db.prepare('SELECT id FROM workout_template_items WHERE template_id=2 ORDER BY id LIMIT 1').get().id;
  assert.equal((await req(env,`/app/exercicios/${foreign}/concluir`,{method:'POST',cookie,form:{csrf_token:token,done:1}})).status,403);
  assert.equal((await req(env,`/app/exercicios/${item}/concluir`,{method:'POST',cookie,form:{done:1}})).status,403);
  const done=await req(env,`/app/exercicios/${item}/concluir`,{method:'POST',cookie,form:{csrf_token:token,done:1}});
  assert.equal(done.status,302);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_exercise_checks WHERE student_id=1 AND item_id=?').get(item).c,1);
  await req(env,`/app/exercicios/${item}/concluir`,{method:'POST',cookie,form:{csrf_token:token,done:1}});
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_exercise_checks WHERE student_id=1 AND item_id=?').get(item).c,1,'replay is idempotent');
  await req(env,`/app/exercicios/${item}/concluir`,{method:'POST',cookie,form:{csrf_token:token,done:0}});
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_exercise_checks WHERE student_id=1 AND item_id=?').get(item).c,0);
  const revoke=await req(env,'/alunos/1/acesso/revogar',{method:'POST',cookie:admin,form:{csrf_token:adminCsrf}});
  assert.equal(revoke.status,302);
  assert.equal((await req(env,'/app',{cookie})).headers.get('location'),'/app/entrar');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_portal_sessions WHERE student_id=1').get().c,0);
});

// V1.3 — progresso real visto pelo professor e histórico durável de dias/blocos.
async function activeStudentCookie(env,admin,studentId=1) {
  const adminCsrf=(await csrf(env,admin,`/alunos/${studentId}`)).token;
  const assign=await req(env,`/alunos/${studentId}/treino`,{method:'POST',cookie:admin,
    form:{csrf_token:adminCsrf,template_id:1}});
  assert.equal(assign.status,302);
  const provisional=await createStudentAccess(env,admin,studentId);
  const {cookie}=await studentLogin(env,studentId,provisional);
  const changeHtml=await (await req(env,'/app/senha',{cookie})).text();
  const token=changeHtml.match(/name="csrf_token" value="([a-f0-9]+)"/)[1];
  const updated=await req(env,'/app/senha',{method:'POST',cookie,
    form:{csrf_token:token,old_password:provisional,password:'Senha-v13-aluno-1234',confirm_password:'Senha-v13-aluno-1234'}});
  assert.equal(updated.status,302);
  return {cookie,token,adminCsrf};
}

test('V1.3 teacher sees real completion from student account, grouped by workout block',async()=>{
  const {env,db,before}=await fixture(),admin=await login(env);
  const student=await activeStudentCookie(env,admin);
  const ids=db.prepare('SELECT id FROM workout_template_items WHERE template_id=1 ORDER BY sort_order,id LIMIT 2').all().map(x=>x.id);
  const total=db.prepare('SELECT COUNT(*) c FROM workout_template_items WHERE template_id=1').get().c;
  const empty=await (await req(env,'/alunos/1/acompanhamento',{cookie:admin})).text();
  assert.match(empty,new RegExp(`0/${total}`));
  assert.match(empty,/Ainda não há exercícios marcados pelo aluno/);
  for (const id of ids) assert.equal((await req(env,`/app/exercicios/${id}/concluir`,{method:'POST',cookie:student.cookie,form:{csrf_token:student.token,done:1}})).status,302);
  const dashboard=await (await req(env,'/alunos/1',{cookie:admin})).text();
  assert.match(dashboard,/Acompanhamento do aluno/);
  assert.match(dashboard,new RegExp(`2/${total}`));
  const panel=await (await req(env,'/alunos/1/acompanhamento',{cookie:admin})).text();
  assert.match(panel,/Exercícios de hoje/);
  assert.match(panel,/Histórico de atividades/);
  assert.match(panel,/Concluído/);
  assert.match(panel,/Pendente/);
  assert.match(panel,/Supino reto/);
  assert.match(panel,/Última atividade/);
  assert.equal(db.prepare('SELECT SUM(completed_exercises) c FROM student_workout_daily WHERE student_id=1 AND day=?').get(todayForTests()).c,2);
  const own=await (await req(env,'/app/historico',{cookie:student.cookie})).text();
  assert.match(own,/MEU HISTÓRICO/);
  assert.match(own,/Treino A/);
  assert.doesNotMatch(own,/Mensalidades|Recebimentos|Recibo/);
  assert.deepEqual(before,{students:55,paid:25});
  assert.equal(db.prepare('SELECT COUNT(*) c FROM students').get().c,55);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM invoices WHERE status='paid'").get().c,25);
});

function todayForTests(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const obj=Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return `${obj.year}-${obj.month}-${obj.day}`;
}

test('V1.3 progress disappears when student unmarks last exercise and cannot be read anonymously',async()=>{
  const {env,db}=await fixture(),admin=await login(env),student=await activeStudentCookie(env,admin);
  const item=db.prepare('SELECT id FROM workout_template_items WHERE template_id=1 ORDER BY id LIMIT 1').get().id;
  const url=`/app/exercicios/${item}/concluir`;
  assert.equal((await req(env,'/alunos/1/acompanhamento')).status,302);
  assert.equal((await req(env,'/app/historico')).status,302);
  assert.equal((await req(env,url,{method:'POST',cookie:student.cookie,form:{csrf_token:student.token,done:1}})).status,302);
  const marked=await (await req(env,'/alunos/1/acompanhamento',{cookie:admin})).text();
  assert.match(marked,/bloco completo|Concluído/);
  assert.equal(db.prepare('SELECT completed_exercises c FROM student_workout_daily WHERE student_id=1').get().c,1);
  assert.equal((await req(env,url,{method:'POST',cookie:student.cookie,form:{csrf_token:student.token,done:0}})).status,302);
  assert.equal(db.prepare('SELECT completed_exercises c FROM student_workout_daily WHERE student_id=1').get().c,0);
  const unmarked=await (await req(env,'/alunos/1/acompanhamento',{cookie:admin})).text();
  assert.match(unmarked,/Ainda não há exercícios marcados pelo aluno/);
  assert.match(unmarked,/Pendente/);
  const other=await (await req(env,'/alunos/2/acompanhamento',{cookie:admin})).text();
  assert.match(other,/Ainda não há exercícios marcados pelo aluno/);
  assert.doesNotMatch(other,/Aluno 1/);
  const own=await (await req(env,'/app/historico',{cookie:student.cookie})).text();
  assert.match(own,/Ainda não há exercícios marcados pelo aluno/);
});

test('V1.3 migration backfills V1.2 checks idempotently and preserves history after template deletion',async()=>{
  const {env,db}=await fixture(),admin=await login(env),student=await activeStudentCookie(env,admin);
  const item=db.prepare('SELECT id FROM workout_template_items WHERE template_id=1 ORDER BY id LIMIT 1').get().id;
  const oldDay='2026-09-01';
  db.prepare('INSERT INTO student_exercise_checks(student_id,item_id,day,completed_at) VALUES(?,?,?,?)').run(1,item,oldDay,oldDay+'T12:00:00.000Z');
  const migration=readFileSync(new URL('../migrations/0003_acompanhamento_v13.sql',import.meta.url),'utf8');
  db.exec(migration);db.exec(migration);
  const old=db.prepare('SELECT * FROM student_workout_daily WHERE student_id=1 AND day=?').get(oldDay);
  assert.equal(old.completed_exercises,1);
  assert.equal(old.template_name,db.prepare('SELECT name FROM workout_templates WHERE id=1').get().name);
  const panel=await (await req(env,'/alunos/1/acompanhamento',{cookie:admin})).text();
  assert.match(panel,/01\/09\/2026/);
  const current=await (await req(env,'/app',{cookie:student.cookie})).text();
  assert.match(current,/HOJE/);
  assert.match(current,/0\/\d+/,'prior days must not count towards today');
  db.prepare('DELETE FROM workout_templates WHERE id=1').run();
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_exercise_checks WHERE student_id=1').get().c,0,'legacy checks cascade with deleted template');
  const retained=db.prepare('SELECT * FROM student_workout_daily WHERE student_id=1 AND day=?').get(oldDay);
  assert.equal(retained.completed_exercises,1,'snapshot survives deleted template');
  const archived=await (await req(env,'/alunos/1/acompanhamento',{cookie:admin})).text();
  assert.match(archived,/01\/09\/2026/);
});

test('V1.3 reassignment starts current-sheet progress fresh but keeps old same-day activity',async()=>{
  const {env,db}=await fixture(),admin=await login(env),student=await activeStudentCookie(env,admin);
  const item1=db.prepare('SELECT id FROM workout_template_items WHERE template_id=1 ORDER BY id LIMIT 1').get().id;
  const item2=db.prepare('SELECT id FROM workout_template_items WHERE template_id=2 ORDER BY id LIMIT 1').get().id;
  await req(env,`/app/exercicios/${item1}/concluir`,{method:'POST',cookie:student.cookie,form:{csrf_token:student.token,done:1}});
  const change=await req(env,'/alunos/1/treino',{method:'POST',cookie:admin,form:{csrf_token:student.adminCsrf,template_id:2}});
  assert.equal(change.status,302);
  let panel=await (await req(env,'/alunos/1/acompanhamento',{cookie:admin})).text();
  assert.match(panel,/Histórico de atividades/);
  assert.match(panel,/Iniciante masculino/,'old sheet still listed in history');
  assert.match(panel,/0\/\d+ · 0%/,'new sheet has zero checks today');
  const prohibited=await req(env,`/app/exercicios/${item1}/concluir`,{method:'POST',cookie:student.cookie,form:{csrf_token:student.token,done:1}});
  assert.equal(prohibited.status,403,'old assignment cannot be marked any more');
  assert.equal((await req(env,`/app/exercicios/${item2}/concluir`,{method:'POST',cookie:student.cookie,form:{csrf_token:student.token,done:1}})).status,302);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_workout_daily WHERE student_id=1 AND completed_exercises>0').get().c,2);
  assert.equal((await req(env,'/alunos/1/acompanhamento',{cookie:student.cookie})).status,302,'student account cannot open professor dashboard');
});

// V1.4 — mídia local, biblioteca visual e mensalidade isolada por matrícula.
test('V1.4 has a curated visual library, 18 own GIFs and no remote image dependency',async()=>{
  const {exerciseLibrary,exerciseGuide,DEMO_GIFS}=await import('../src/exercises.js');
  assert.equal(DEMO_GIFS.length,18);
  assert.equal(exerciseLibrary.length,36);
  assert.equal(exerciseGuide(' Supino reto ').gif,'supino-reto');
  assert.equal(exerciseGuide('Agachamento livre').gif,'agachamento');
  assert.equal(exerciseGuide('Agachamento guiado').gif,null,'no misleading animation for a different machine');
  assert.equal(exerciseGuide('Treino inventado'),null,'unverified exercise never inherits a GIF');
  for(const slug of DEMO_GIFS){
    const gif=readFileSync(new URL(`../public/exercicios/gifs/${slug}.gif`,import.meta.url));
    const poster=readFileSync(new URL(`../public/exercicios/posters/${slug}.webp`,import.meta.url));
    assert.equal(gif.toString('ascii',0,6),'GIF89a',`missing animation ${slug}`);
    assert.equal(poster.toString('ascii',8,12),'WEBP',`missing preview ${slug}`);
    assert.ok(gif.length>10000,`animation appears empty: ${slug}`);
  }
});

test('V1.5 teacher sees a filtered guide catalog and independently opens guide or adds exercise',async()=>{
  const {env}=await fixture(),admin=await login(env);
  const page=await (await req(env,'/treinos/novo',{cookie:admin})).text();
  assert.match(page,/data-library-exercise="Supino reto"/);
  assert.match(page,/data-library-category="Costas"/);
  assert.match(page,/data-library-add/);
  assert.match(page,/data-preview-name="Supino reto"/);
  assert.match(page,/data-preview-steps=/);
  assert.doesNotMatch(page,/data-preview-gif|GIF ilustrativo/);
  assert.match(page,/id="exerciseDemoDialog"/);
  assert.match(page,/o professor ajusta o movimento e a carga/i);
  assert.match(page,/data-preview-name="Agachamento guiado"/, 'the variation still has a guide');
  assert.match(page,/data-preview-video=""/, 'unreviewed video is not substituted');
});

test('V1.5 gives all catalogued exercises three tailored steps and never assigns a video by similarity',async()=>{
  const {exerciseLibrary,exercisePresentation}=await import('../src/exercises.js');
  assert.equal(exerciseLibrary.length,36);
  for(const exercise of exerciseLibrary){
    const guide=exercisePresentation(exercise.name);
    assert.equal(guide.steps.length,3,exercise.name);
    assert.equal(guide.video,null,exercise.name);
  }
  assert.equal(exercisePresentation('Agachamento livre ou guiado'),null);
});

test('V1.6 migration adds notes without touching existing workout items or paid invoices',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE workout_template_items(id INTEGER PRIMARY KEY,template_id INTEGER,exercise TEXT);
    CREATE TABLE students(id INTEGER PRIMARY KEY,name TEXT);
    CREATE TABLE invoices(id INTEGER PRIMARY KEY,student_id INTEGER,status TEXT,receipt_number TEXT);
    INSERT INTO workout_template_items VALUES(31,1,'Supino reto');
    INSERT INTO students VALUES(7,'Aluno de teste');
    INSERT INTO invoices VALUES(9,7,'paid','RECIBO-9');`);
  db.exec(readFileSync(new URL('../migrations/0004_observacoes_exercicios_v16.sql',import.meta.url),'utf8'));
  assert.deepEqual({...db.prepare('SELECT id,exercise,exercise_notes FROM workout_template_items').get()},{id:31,exercise:'Supino reto',exercise_notes:''});
  assert.deepEqual({...db.prepare('SELECT * FROM invoices').get()},{id:9,student_id:7,status:'paid',receipt_number:'RECIBO-9'});
});

test('V1.6 teacher notes survive an edit and reach the student without losing completion or payment',async()=>{
  const {env,db}=await fixture(),admin=await login(env);
  const student=await activeStudentCookie(env,admin);
  const original=db.prepare('SELECT id,workout_label,exercise,sets,reps,rest FROM workout_template_items WHERE template_id=1 ORDER BY sort_order,id').all();
  const first=original[0],invoice=db.prepare('SELECT * FROM invoices WHERE student_id=1').get();
  const completed=await req(env,`/app/exercicios/${first.id}/concluir`,{method:'POST',cookie:student.cookie,form:{csrf_token:student.token,done:1}});
  assert.equal(completed.status,302);
  const {token}=await csrf(env,admin,'/treinos/1/editar');
  const form=new URLSearchParams({csrf_token:token,name:'Treino iniciante',audience:'Todos',level:'Iniciante',notes:''});
  for(const item of original){
    for(const field of ['id','workout_label','exercise','sets','reps','rest'])form.append(field==='id'?'item_id':field,String(item[field]||''));
    form.append('exercise_notes',item.id===first.id?'Segure 2 segundos no topo.':'');
  }
  const edited=await req(env,'/treinos/1/editar',{method:'POST',cookie:admin,form});
  assert.equal(edited.status,302);
  assert.equal(db.prepare('SELECT exercise_notes FROM workout_template_items WHERE id=?').get(first.id).exercise_notes,'Segure 2 segundos no topo.');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_exercise_checks WHERE student_id=1 AND item_id=?').get(first.id).c,1);
  assert.deepEqual(db.prepare('SELECT * FROM invoices WHERE student_id=1').get(),invoice);
  const portal=await (await req(env,'/app',{cookie:student.cookie})).text();
  assert.match(portal,/Recado do professor/);
  assert.match(portal,/Segure 2 segundos no topo/);
  const editForm=await (await req(env,'/treinos/1/editar',{cookie:admin})).text();
  assert.match(editForm,/name="exercise_notes"/);
  assert.match(editForm,/value="[0-9]+"/);
  assert.match(editForm,/data-library-favorite/);
});

test('V1.6 teacher can create a new sheet with a per-exercise note',async()=>{
  const {env,db}=await fixture(),admin=await login(env);
  const {token}=await csrf(env,admin,'/treinos/novo');
  const saved=await req(env,'/treinos',{method:'POST',cookie:admin,form:{
    csrf_token:token,name:'Ficha anotada de teste',audience:'Todos',level:'Personalizado',
    workout_label:'Treino A',exercise:'Remada baixa',sets:'3',reps:'12',rest:'60s',
    exercise_notes:'Ajuste o assento antes de iniciar.'
  }});
  assert.equal(saved.status,302);
  const item=db.prepare(`SELECT i.exercise,i.exercise_notes FROM workout_template_items i
    JOIN workout_templates t ON t.id=i.template_id WHERE t.name='Ficha anotada de teste'`).get();
  assert.equal(item.exercise_notes,'Ajuste o assento antes de iniciar.');
  assert.equal(item.exercise,'Remada baixa');
});

test('V1.6.1 pending migration shows clear instructions before editing or writing data',async()=>{
  const {env,db}=await fixture({applyV16:false}),admin=await login(env);
  const before=db.prepare('SELECT name FROM workout_templates WHERE id=1').get().name;
  const form=await req(env,'/treinos/1/editar',{cookie:admin});
  assert.equal(form.status,503);
  assert.match(await form.text(),/npm run migrate:local/);
  const {token}=await csrf(env,admin,'/treinos/1');
  const save=await req(env,'/treinos/1/editar',{method:'POST',cookie:admin,form:{csrf_token:token,name:'Não pode salvar'}});
  assert.equal(save.status,503);
  assert.equal(db.prepare('SELECT name FROM workout_templates WHERE id=1').get().name,before);
  db.exec(readFileSync(new URL('../migrations/0004_observacoes_exercicios_v16.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0005_series_cargas_v18.sql',import.meta.url),'utf8'));
  assert.equal((await req(env,'/treinos/1/editar',{cookie:admin})).status,200);
});

test('V1.7 portal offers an installable manifest with valid icon sizes',async()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'));
  assert.equal(manifest.start_url,'/app');
  assert.equal(manifest.scope,'/app');
  assert.equal(manifest.display,'standalone');
  for(const size of [192,512]){
    const icon=manifest.icons.find(row=>row.sizes===`${size}x${size}`&&row.purpose==='any');
    assert.ok(icon);
    const png=readFileSync(new URL(`../public${icon.src}`,import.meta.url));
    assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16),size);
    assert.equal(png.readUInt32BE(20),size);
  }
  assert.ok(manifest.icons.some(row=>row.purpose==='maskable'));
  const {env}=await fixture(),admin=await login(env),student=await activeStudentCookie(env,admin);
  const portal=await (await req(env,'/app',{cookie:student.cookie})).text();
  assert.match(portal,/rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(portal,/data-install-app hidden/);
  const adminPage=await (await req(env,'/treinos',{cookie:admin})).text();
  assert.doesNotMatch(adminPage,/rel="manifest"/);
});

test('V1.7 service worker serves an offline notice without caching private pages',async()=>{
  const handlers={};const added=[];let networkFails=false,cacheWrites=0;
  const cached=new Response('Sem conexão no momento',{status:200});
  const caches={
    open:async()=>({add:async path=>{added.push(path)},put:()=>{cacheWrites++}}),
    keys:async()=>[],match:async path=>path==='/offline.html'?cached:null
  };
  const self={location:{origin:BASE},addEventListener:(type,fn)=>{handlers[type]=fn},skipWaiting:async()=>{},clients:{claim:async()=>{}}};
  runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{
    self,caches,URL,Response,fetch:async()=>{if(networkFails)throw Error('offline');return new Response('private page')}
  });
  let waiting;handlers.install({waitUntil:promise=>{waiting=promise}});await waiting;
  assert.deepEqual(added,['/offline.html']);
  const request={mode:'navigate',method:'GET',url:`${BASE}/app/mensalidade`};
  let response;handlers.fetch({request,respondWith:promise=>{response=promise}});
  assert.equal(await (await response).text(),'private page');
  networkFails=true;handlers.fetch({request,respondWith:promise=>{response=promise}});
  assert.equal(await (await response).text(),'Sem conexão no momento');
  response=null;handlers.fetch({request:{...request,url:`${BASE}/treinos`},respondWith:promise=>{response=promise}});
  assert.equal(response,null);
  response=null;handlers.fetch({request:{...request,method:'POST'},respondWith:promise=>{response=promise}});
  assert.equal(response,null);
  assert.equal(cacheWrites,0);
});

test('V1.8 migration adds series and suggested load while preserving real student and payment rows',async()=>{
  const {db,before}=await fixture({applyV16:false});
  const paidBefore=db.prepare("SELECT id,receipt_number FROM invoices WHERE status='paid' ORDER BY id").all();
  db.exec(readFileSync(new URL('../migrations/0004_observacoes_exercicios_v16.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0005_series_cargas_v18.sql',import.meta.url),'utf8'));
  assert.equal(db.prepare('SELECT COUNT(*) c FROM students').get().c,before.students);
  assert.deepEqual(db.prepare("SELECT id,receipt_number FROM invoices WHERE status='paid' ORDER BY id").all(),paidBefore);
  assert.equal(db.prepare('SELECT suggested_load FROM workout_template_items LIMIT 1').get().suggested_load,'');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_exercise_sets').get().c,0);
});

test('V1.8 student records and updates own sets; history and professor load stay private',async()=>{
  const {env,db}=await fixture(),admin=await login(env),student=await activeStudentCookie(env,admin);
  const item=db.prepare('SELECT id FROM workout_template_items WHERE template_id=1 ORDER BY sort_order,id LIMIT 1').get().id;
  const before=db.prepare('SELECT * FROM invoices WHERE student_id=1').all();
  const {token}=await csrf(env,admin,'/treinos/1/editar');
  const originals=db.prepare('SELECT * FROM workout_template_items WHERE template_id=1 ORDER BY sort_order,id').all();
  const form=new URLSearchParams({csrf_token:token,name:'Treino iniciante',audience:'Todos',level:'Iniciante',notes:''});
  for(const row of originals){
    for(const [key,value] of Object.entries({item_id:row.id,workout_label:row.workout_label,exercise:row.exercise,sets:row.sets,reps:row.reps,rest:row.rest,exercise_notes:row.exercise_notes,suggested_load:row.id===item?'25 kg':''}))form.append(key,String(value??''));
  }
  assert.equal((await req(env,'/treinos/1/editar',{method:'POST',cookie:admin,form})).status,302);
  const focus=await req(env,`/app/foco/${item}`,{cookie:student.cookie});
  assert.equal(focus.status,200);assert.match(await focus.text(),/25 kg/);
  const save=(cookie,csrf_token,load_kg,set_number=1,action='save')=>req(env,`/app/foco/${item}/serie`,{method:'POST',cookie,form:{csrf_token,set_number,load_kg,action}});
  assert.equal((await save(student.cookie,student.token,'28')).status,302);
  assert.equal((await save(student.cookie,student.token,'30')).status,302);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_exercise_sets WHERE student_id=1').get().c,1);
  assert.equal(db.prepare('SELECT load_kg FROM student_exercise_sets WHERE student_id=1').get().load_kg,30);
  assert.equal((await save(student.cookie,student.token,'1001')).status,400);
  assert.equal((await save(student.cookie,student.token,'30',99)).status,400);
  assert.equal((await save(student.cookie,'invalid','20')).status,403);
  assert.equal((await req(env,`/app/foco/${item}`)).headers.get('location'),'/app/entrar');
  assert.equal((await req(env,`/app/foco/${item}`,{cookie:admin})).headers.get('location'),'/app/entrar');
  const history=await (await req(env,'/app/historico',{cookie:student.cookie})).text();
  assert.match(history,/Histórico de cargas e séries/);assert.match(history,/30 kg/);assert.match(history,/Frequência desta semana/);
  assert.deepEqual(db.prepare('SELECT * FROM invoices WHERE student_id=1').all(),before);
  assert.equal((await save(student.cookie,student.token,'',1,'remove')).status,302);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_exercise_sets WHERE student_id=1').get().c,0);
});

test('V1.8.2 existing exercises link to a YouTube search without GIFs or student details',async()=>{
  const {env,db}=await fixture(),admin=await login(env),student=await activeStudentCookie(env,admin);
  const item=db.prepare('SELECT id FROM workout_template_items WHERE template_id=1 ORDER BY sort_order,id LIMIT 1').get().id;
  const name='Supino reto';
  const expected=`https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} execução do exercício`)}`;
  const page=await (await req(env,'/app',{cookie:student.cookie})).text();
  assert.ok(page.includes(`href="${expected}"`));
  assert.match(page,/target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(page,/data-gif-src|Ver GIF ilustrativo|<img[^>]*\s+src="\/exercicios\/gifs\//);
  const focus=await (await req(env,`/app/foco/${item}`,{cookie:student.cookie})).text();
  assert.ok(focus.includes(`href="${expected}"`));
  const teacher=await (await req(env,'/treinos/1',{cookie:admin})).text();
  assert.ok(teacher.includes(`href="${expected}"`));
  const library=await (await req(env,'/treinos/novo',{cookie:admin})).text();
  assert.ok(library.includes(`data-preview-youtube="${expected}"`));
  db.prepare('UPDATE workout_template_items SET exercise=?,exercise_notes=? WHERE id=?').run('Puxada & teste <personalizado>','João: joelho esquerdo',item);
  const custom=await (await req(env,'/app',{cookie:student.cookie})).text();
  const url=`https://www.youtube.com/results?search_query=${encodeURIComponent('Puxada & teste <personalizado> execução do exercício')}`;
  assert.ok(custom.includes(`href="${url}"`));
  assert.doesNotMatch(custom,/search_query=[^"\s]*Jo%C3%A3o/,'teacher notes stay out of external search');
  assert.match(custom,/Puxada &amp; teste &lt;personalizado&gt;/);
});

test('V1.5 student sees exact guide, graceful media fallback, mobile navigation and can complete exercise',async()=>{
  const {env,db}=await fixture(),admin=await login(env),student=await activeStudentCookie(env,admin);
  const page=await (await req(env,'/app',{cookie:student.cookie})).text();
  assert.match(page,/href="\/app\/mensalidade"/);
  assert.match(page,/Capa gráfica: Supino reto/);
  assert.match(page,/Demonstração em vídeo em preparação/);
  assert.doesNotMatch(page,/\/exercicios\/gifs\//);
  assert.match(page,/escápulas apoiadas no banco/);
  assert.match(page,/Ver guia de execução/);
  assert.match(page,/Peça ao professor uma demonstração e orientações específicas/, 'manual exercise gets a safe fallback');
  assert.doesNotMatch(page,/<script[^>]*src="https:\/\//,'no externally hosted animation scripts');
  const id=db.prepare('SELECT id FROM workout_template_items WHERE template_id=1 ORDER BY id LIMIT 1').get().id;
  assert.equal((await req(env,`/app/exercicios/${id}/concluir`,{method:'POST',cookie:student.cookie,form:{csrf_token:student.token,done:1}})).status,302);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM student_exercise_checks WHERE student_id=1').get().c,1);
});

test('V1.4 monthly notice is private, read-only and displays paid current invoice plus estimated next due',async()=>{
  const {env,db}=await fixture(),admin=await login(env),student=await activeStudentCookie(env,admin);
  assert.equal((await req(env,'/app/mensalidade')).headers.get('location'),'/app/entrar');
  assert.equal((await req(env,'/app/mensalidade',{cookie:admin})).headers.get('location'),'/app/entrar','admin session is not student session');
  const before=db.prepare('SELECT * FROM invoices WHERE student_id=1').all();
  const page=await (await req(env,'/app/mensalidade?student_id=2',{cookie:student.cookie})).text();
  assert.match(page,/Minha mensalidade/);
  assert.match(page,/Próxima data estimada/);
  assert.match(page,/Ainda não é uma cobrança lançada/);
  assert.match(page,/Pago em/);
  assert.match(page,/VALOR CADASTRADO/);
  assert.match(page,/href="\/app"/);
  assert.doesNotMatch(page,/ST-TESTE-2|Aluno 2/,'other students never exposed');
  assert.deepEqual(db.prepare('SELECT * FROM invoices WHERE student_id=1').all(),before,'GET must never change paid or open invoices');
});

test('V1.4 existing due_date takes precedence over edited plan day; unpaid invoices are labeled as issued',async()=>{
  const {env,db}=await fixture(),admin=await login(env),student=await activeStudentCookie(env,admin,30);
  db.prepare('UPDATE students SET due_day=2 WHERE id=30').run();
  const ownDue=db.prepare('SELECT due_date FROM invoices WHERE student_id=30').get().due_date;
  const page=await (await req(env,'/app/mensalidade',{cookie:student.cookie})).text();
  const br=ownDue.split('-').reverse().join('/');
  assert.match(page,new RegExp(br));
  assert.match(page,/Próxima cobrança em aberto|Cobrança vencida mais antiga/);
  assert.doesNotMatch(page,/Ainda não é uma cobrança lançada/);
  assert.match(page,/R\$\s*90,00/);
});

test('V1.4 oldest overdue remains visible even when the current invoice is paid',async()=>{
  const {env,db}=await fixture(),admin=await login(env),student=await activeStudentCookie(env,admin);
  const [year,month]=ref.split('-').map(Number);
  const previous=new Date(Date.UTC(year,month-2,1)).toISOString().slice(0,7);
  db.prepare('INSERT INTO invoices(student_id,reference_month,due_date,amount,status) VALUES(?,?,?,?,?)').run(1,previous,`${previous}-08`,75,'open');
  const page=await (await req(env,'/app/mensalidade',{cookie:student.cookie})).text();
  assert.match(page,/Cobrança vencida mais antiga/);
  assert.match(page,/Vencido/);
  assert.match(page,/75,00/);
  assert.match(page,/Pago em/,'the separate paid current month is not rewritten');
});

test('V1.4 without issued invoices offers only an estimate and never fabricates payments or debts',async()=>{
  const {env,db}=await fixture(),admin=await login(env),student=await activeStudentCookie(env,admin);
  db.prepare('DELETE FROM invoices WHERE student_id=1').run();
  db.prepare('UPDATE students SET due_day=31 WHERE id=1').run();
  const page=await (await req(env,'/app/mensalidade',{cookie:student.cookie})).text();
  assert.match(page,/Próxima data estimada/);
  assert.match(page,/Não lançada/);
  assert.match(page,/Ainda não há cobranças lançadas/);
  assert.match(page,/dia 31/);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices WHERE student_id=1').get().c,0);
});
