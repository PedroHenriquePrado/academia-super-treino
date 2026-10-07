# Super Treino V1.9.0 — pacote completo

Este pacote foi montado a partir da pasta V1.8.2 enviada em 07/10/2026. O código dessa pasta já continha a correção de pagamentos identificada na tela como V1.8.3. A V1.9.0 acrescenta o controle de mensalidades por mês. É uma **pasta completa para publicar**, com código, recursos, configuração, testes e migrações históricas. Não inclui cópias do banco, dados de alunos nem `node_modules`.

## O que mudou

- **Mensalidades** abre em **Pagaram** no mês atual. Setas e seletor permitem ver outros meses.
- A lista de pagamentos traz aluno, data em que pagou, mês de referência da mensalidade, valor e recibo. Há total no alto e no fim. Um pagamento de setembro recebido em outubro entra no total de outubro, com referência setembro.
- **A receber**, **Vencidas**, **Hoje** e **Próximos 3 dias** consideram somente cobranças abertas do mês selecionado. O filtro de alunos **Sem atraso** não equivale a mensalidade paga.
- Um pagamento lançado por engano pode voltar a aberto pelo recibo. Um lançamento inteiramente indevido, pago ou aberto, pode ser anulado com motivo. Cada alteração fica no histórico administrativo.

## Publicar sem mexer nos dados

1. Guarde a pasta atual em outro lugar. Extraia este ZIP e abra o terminal **dentro da pasta `academia-super-treino-v1.9.0`**, onde estão `package.json` e `wrangler.jsonc`.
2. Execute `npm ci` e depois `npm test`. Os testes devem terminar sem falhas. O pacote não contém `node_modules`, que é recriado para o computador usado.
3. Antes de publicar, exporte o banco real e guarde a cópia **fora da pasta do projeto**:

   ```bat
   npx wrangler d1 export super-treino-prod --remote --output=backup-antes-v190.sql
   ```

   Confirme que o arquivo existe e não está vazio. Ele contém dados privados dos alunos.
4. Confira a compilação com `npx wrangler deploy --dry-run`. Depois publique com `npx wrangler deploy` na mesma conta Cloudflare usada anteriormente.

**Não execute `schema.sql`, `db:local`, `migrate:remote` nem importe o backup para esta atualização.** Não há migração nova. A publicação troca o código e os arquivos públicos; mantém o D1 configurado em `wrangler.jsonc` e os registros já existentes nele. Não deixe um ZIP antigo aberto ao executar os comandos.

## Conferência rápida

1. Abra **Mensalidades → Pagaram**, escolha outubro e confira datas, valores e total. Volte para setembro pela seta.
2. Abra **A receber** no mesmo mês e confira se os valores ainda não pagos estão separados.
3. Se houver lançamentos errados, confira **aluno, mês e valor** antes de corrigir. Para um pagamento, use **Recibo / corrigir**; para uma cobrança aberta, use **Anular lançamento indevido**. Faça um de cada vez e confira o total. Nenhum dos três lançamentos mencionados foi alterado diretamente no banco.
4. Confira um aluno, um recibo real e o rodapé **Versão 1.9.0** na área do aluno.
