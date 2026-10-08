# Super Treino V1.9.2 — duplicados e exclusão definitiva

Este é o pacote **completo**, feito sobre a V1.9.1. Inclui código, interface, migrações anteriores e testes. Não inclui alunos, mensalidades reais nem backups. O banco D1 existente permanece o mesmo; **esta atualização não exige migração**.

## O que mudou

- **Duplicados:** a lista considera o nome completo igual, ignorando acentos, pontuação e diferenças de maiúsculas. O mesmo WhatsApp entre nomes diferentes não cria um par; o telefone igual aparece apenas como informação adicional quando o nome também coincide. A comparação e a opção de transferir mensalidades da V1.9.1 continuam disponíveis.
- **Alunos → abrir ficha → Editar cadastro:** no fim da edição há o atalho **Conferir exclusão definitiva**.
- **Alunos → Arquivados:** cada linha tem o atalho **Excluir definitivamente**. O mesmo atalho existe na ficha de alunos ativos e arquivados.
- A tela de exclusão direta mostra **todas** as mensalidades, pagamentos e recibos daquele cadastro. Ela remove o aluno, suas cobranças, acesso e registros de treino do banco ativo, **sem transferir mensalidades a outro aluno**. Exige motivo, confirmação escrita, ciência do backup e uma confirmação final. Se dados mudaram desde a abertura da tela, a operação é bloqueada. O resumo fica no histórico administrativo.
- Para preservar mensalidades de um cadastro repetido, use a opção **Duplicados → Comparar**, que permite transferir lançamentos válidos antes de excluir.

**Atenção:** excluir uma mensalidade paga altera os totais de Mensalidades. Um backup SQL feito antes da exclusão é a forma de recuperar um cadastro apagado. Backups antigos não são modificados pela exclusão.

## Publicar no mesmo aplicativo

1. Guarde a pasta usada anteriormente. Extraia este ZIP completo numa pasta nova e abra o `cmd` na pasta que contém `package.json`.
2. Execute `npm ci` e `npm test` (50 testes).
3. Faça o backup do banco **antes de usar qualquer exclusão**:

   ```bat
   npx wrangler d1 export super-treino-prod --remote --output=..\backup-antes-v192.sql
   ```

   Confirme que o arquivo apareceu na pasta acima do projeto e guarde-o em lugar privado: contém dados dos alunos.
4. Execute `npx wrangler deploy --dry-run` e depois `npx wrangler deploy`, usando a **mesma conta Cloudflare** do aplicativo anterior.

Não execute `schema.sql`, migrações remotas nem restauração de backup nesta atualização.

## Testar depois de publicar

1. Em **Duplicados**, confirme que dois alunos com nomes diferentes e o mesmo WhatsApp não aparecem como par. Dois cadastros com o mesmo nome devem aparecer para conferência.
2. Abra **Alunos → um aluno → Editar cadastro** e encontre **Conferir exclusão definitiva**; abra a tela, confira os dados e volte **sem excluir**.
3. Em **Alunos → Arquivados**, encontre **Excluir definitivamente** na linha de um aluno; confira os recibos e volte **sem excluir**.
4. Só apague um cadastro de teste ou um aluno cuja exclusão foi conferida e cujo backup SQL já foi salvo. Depois confira **Mensalidades** e **Usuários e segurança → Histórico**.
5. O rodapé da área do aluno deve mostrar **Versão 1.9.2**.

## Enviar ao GitHub depois da publicação

O `git push` atualiza o código no GitHub e **não** publica o aplicativo. Se a pasta em que você publicou não possui Git, abra o `cmd` nessa pasta e execute uma linha por vez:

```bat
git clone https://github.com/PedroHenriquePrado/academia-super-treino.git ..\academia-super-treino-github-v192
copy /Y src\index.js ..\academia-super-treino-github-v192\src\index.js
copy /Y src\duplicates.js ..\academia-super-treino-github-v192\src\duplicates.js
copy /Y public\app.js ..\academia-super-treino-github-v192\public\app.js
copy /Y public\style.css ..\academia-super-treino-github-v192\public\style.css
copy /Y tests\v43.test.js ..\academia-super-treino-github-v192\tests\v43.test.js
copy /Y LEIA-PRIMEIRO-V1.9.2.md ..\academia-super-treino-github-v192\LEIA-PRIMEIRO-V1.9.2.md
cd ..\academia-super-treino-github-v192
git add src/index.js src/duplicates.js public/app.js public/style.css tests/v43.test.js LEIA-PRIMEIRO-V1.9.2.md
git commit -m "Melhora duplicados e exclusao de alunos"
git push
```

Se algum comando falhar, pare e confira o erro antes de seguir.
