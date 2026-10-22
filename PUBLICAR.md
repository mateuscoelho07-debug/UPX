# Como publicar o RotaU na internet

Este guia mostra, passo a passo, como colocar o site do RotaU no ar usando o **Railway** (railway.com). O Railway lê o código direto do seu GitHub, monta o site sozinho e publica de novo toda vez que você enviar uma mudança para a branch `main`.

O site e a API rodam juntos, num único serviço: a API (Express) também entrega as páginas do site. O banco de dados (SQLite) fica guardado num **volume**, que é um disco que não é apagado quando o site é publicado de novo.

## O que já está pronto no repositório

- `Dockerfile`: a "receita" que o Railway usa para compilar o site e ligar a API.
- `railway.json`: diz ao Railway para usar o `Dockerfile` e qual endereço testar para saber se o site subiu (`/api/health`).
- `.dockerignore`: arquivos que não precisam ir para o servidor.

Você não precisa mexer nesses arquivos.

## Quanto custa

O Railway oferece um período de teste com crédito grátis. Depois disso, o plano mais barato (Hobby) custa cerca de **US$ 5 por mês**, e um site pequeno como o RotaU costuma caber nesse valor. Confira o preço atual em https://railway.com/pricing antes de começar.

## Passo 1: criar a conta

1. Entre em https://railway.com e clique em **Login**.
2. Escolha **Login with GitHub** e entre com a conta `mateuscoelho07-debug`.
3. Aceite os termos. Se pedir, confirme o e-mail.

## Passo 2: criar o projeto a partir do GitHub

1. No painel do Railway, clique em **New Project** (ou **+ New**).
2. Escolha **Deploy from GitHub repo**.
3. Se for a primeira vez, clique em **Configure GitHub App** e autorize o Railway a ver o repositório **UPX** (pode escolher "Only select repositories" e marcar só ele).
4. Selecione o repositório **UPX**.
5. O Railway encontra o `Dockerfile` sozinho e começa a primeira publicação. Ela pode falhar ou ficar sem banco persistente até você terminar os próximos passos; tudo bem.

## Passo 3: criar o disco do banco de dados (volume)

Sem este passo, **todos os cadastros são apagados** a cada nova publicação.

1. Dentro do projeto, clique com o botão direito no quadrado do serviço **UPX** (ou aperte `Ctrl + K` / `Cmd + K`) e escolha **Add Volume** / **Attach Volume**.
2. Em **Mount path**, escreva exatamente: `/data`
3. Confirme. O Railway vai publicar o site de novo.

O banco fica no arquivo `/data/rotau.db` dentro desse volume.

## Passo 4: configurar as variáveis

1. Clique no serviço **UPX** e abra a aba **Variables**.
2. Clique em **New Variable** e crie:

| Nome | Valor | Para que serve |
| --- | --- | --- |
| `ADMIN_TOKEN` | uma senha forte, inventada por você (ex.: 20 letras e números misturados) | Protege o painel `/admin`. Sem ela, qualquer pessoa vê todos os dados do banco. |
| `SEED` | `false` | Opcional. Com `false`, o banco começa vazio, sem os motoristas e estudantes de exemplo. Deixe sem essa variável se quiser os exemplos para demonstrar o site. |

3. Clique em **Deploy** (ou **Apply changes**) para publicar com as variáveis novas.

Não crie a variável `PORT`: o Railway já define a porta sozinho. A variável `DB_PATH` também já vem pronta no `Dockerfile` (`/data/rotau.db`).

Guarde o `ADMIN_TOKEN` num lugar seguro e nunca coloque essa senha no código ou no GitHub.

## Passo 5: ganhar um endereço na internet

1. No serviço **UPX**, abra **Settings** e procure a seção **Networking**.
2. Clique em **Generate Domain**.
3. O Railway cria um endereço parecido com `upx-production.up.railway.app`. Abra esse endereço no navegador: o site do RotaU deve aparecer.

Para conferir se a API está funcionando, abra `https://SEU-ENDERECO/api/health`. Deve aparecer `{"ok":true}`.

O painel de administração fica em `https://SEU-ENDERECO/admin` e pede o `ADMIN_TOKEN`.

## Passo 6 (opcional): usar um domínio próprio, como rotau.com.br

1. Compre o domínio num registrador (para `.com.br`, use https://registro.br).
2. No Railway, em **Settings → Networking**, clique em **Custom Domain** e digite o domínio (ex.: `www.rotau.com.br`).
3. O Railway mostra um registro **CNAME** (e às vezes um registro **TXT** de verificação). Copie esses valores.
4. No site do registrador, abra a configuração de **DNS** do domínio e crie os mesmos registros.
5. Espere de alguns minutos a algumas horas. Quando o Railway mostrar o domínio como ativo, o site já abre por ele, com cadeado (HTTPS) automático.

## Como atualizar o site depois

Toda vez que uma mudança entrar na branch `main` do GitHub (por exemplo, ao aprovar e juntar um pull request), o Railway publica a nova versão sozinho em poucos minutos. Os dados do banco continuam guardados no volume.

Para acompanhar, abra o serviço no Railway e veja a aba **Deployments**. Clique numa publicação e em **View logs** para ver as mensagens do servidor.

## Cópia de segurança do banco

No Railway, clique no volume e procure a aba **Backups** para criar ou agendar cópias. Faça uma cópia antes de mudanças grandes.

## Se algo der errado

- **A publicação falhou:** abra **Deployments → View logs** e leia as últimas linhas em vermelho. Copie a mensagem e peça ajuda com ela.
- **O site abre, mas os cadastros somem depois de publicar:** o volume não foi criado ou o caminho não é `/data`. Refaça o Passo 3.
- **O painel `/admin` abre sem pedir senha:** a variável `ADMIN_TOKEN` não foi criada. Refaça o Passo 4.
- **"Application failed to respond":** espere um minuto e recarregue. Se continuar, veja os logs.

## Outras hospedagens

O `Dockerfile` funciona em qualquer serviço que aceite Docker (Render, Fly.io e outros). O importante é sempre: montar um disco persistente em `/data` e definir `ADMIN_TOKEN`. A porta vem da variável `PORT`, que esses serviços também definem sozinhos.
