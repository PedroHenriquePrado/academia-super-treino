# Super Treino V1.9.1 — possíveis alunos duplicados

Pacote completo montado a partir do ZIP V1.9.0 enviado pela academia. Contém código, recursos, configuração, migrações antigas e testes. Não contém alunos, mensalidades reais, backups ou `node_modules`. **Esta versão não cria nem migra tabelas.**

## O que foi adicionado

- No painel administrativo, **Duplicados** lista pares com telefone igual ou nome completo igual após retirar pontuação, acentos e diferenças de maiúsculas. É uma sugestão para conferir: nomes iguais e telefones compartilhados não provam que as duas fichas são da mesma pessoa.
- **Comparar** mostra as duas fichas, todas as mensalidades, recibos, valores recebidos e quantidade de registros de treino. É possível inverter qual cadastro fica.
- Na confirmação, escolha **preservar pagamentos e mensalidades válidas** (move para o cadastro mantido as mensalidades exclusivas e substitui as abertas/canceladas quando a outra está paga) ou **excluir todas as mensalidades do cadastro duplicado** (remove inclusive pagamentos e recibos daquele cadastro). Se os dois cadastros têm mensalidade **paga do mesmo mês**, a transferência é bloqueada para conferência manual; não se escolhe automaticamente qual pagamento é verdadeiro.
- A exclusão remove o cadastro excedente, seu acesso ao app, suas sessões e seus registros de treino do banco ativo. Ela exige motivo, ciência sobre o backup e digitação de `EXCLUIR NÚMERO`. As alterações são feitas juntas, ou nenhuma é aplicada se ocorrer erro. Um resumo administrativo registra a operação.

**Atenção:** excluir pagamentos altera os totais da página Mensalidades. A recuperação de um cadastro apagado depende de um backup anterior. Backups já guardados são arquivos independentes e não são alterados pela exclusão.

## Como publicar no computador

1. Guarde a pasta atual. Extraia o ZIP desta versão em uma pasta nova e abra o `cmd` na pasta que contém `package.json`.
2. Execute `npm ci` e `npm test`. Os 48 testes devem passar.
3. Faça uma exportação do D1 de produção e confirme que o arquivo apareceu na pasta acima do projeto:

   ```bat
   npx wrangler d1 export super-treino-prod --remote --output=..\backup-antes-v191.sql
   ```

   Guarde esse arquivo em lugar privado: ele contém dados dos alunos.
4. Execute `npx wrangler deploy --dry-run` e, se terminar sem erros, `npx wrangler deploy` na mesma conta Cloudflare de antes.

Não execute `schema.sql`, migrações remotas ou restauração de backup nesta atualização. O Worker continua apontando para o D1 existente conforme `wrangler.jsonc`.

## Conferência após publicar

1. Entre no painel como administrador e abra **Duplicados** no menu. Veja um par e clique em **Comparar**.
2. Confira os dados e todos os recibos. Use **Inverter quem permanece** se necessário. Se forem pessoas diferentes, saia sem excluir.
3. Se for realmente um cadastro duplicado, selecione a opção apropriada para as mensalidades, confirme o backup, informe o motivo e digite a frase exibida. Faça **um aluno por vez** e confira o total em **Mensalidades** depois.
4. Abra a ficha que ficou, um recibo real e a área do aluno. O rodapé da área do aluno mostra **Versão 1.9.1**.

## Atualizar o GitHub que já existe

Se a pasta V1.9.0 do seu computador já tem o repositório Git, copie **somente** `src/index.js`, `src/duplicates.js`, `public/style.css`, `tests/v43.test.js` e este guia para os mesmos caminhos naquela pasta. Preserve a pasta `.git` e o `.gitignore` que você criou. Depois, no `cmd` dessa pasta:

```bat
npm test
git status --short
git add src/index.js src/duplicates.js public/style.css tests/v43.test.js LEIA-PRIMEIRO-V1.9.1.md
git commit -m "Adiciona revisao de alunos duplicados"
git push
```

O GitHub armazena o código; `git push` não publica a atualização no Worker. Para usar essa mesma pasta na publicação, faça o backup D1 e execute os comandos Wrangler dos passos anteriores.
