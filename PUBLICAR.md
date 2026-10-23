# Como publicar o RotaU de graça (Vercel + Turso)

Este guia coloca o RotaU na internet **sem pagar nada**, usando dois serviços:

- **Vercel** (vercel.com): hospeda o site e a API. Ele lê o código direto do seu GitHub e publica de novo a cada mudança.
- **Turso** (turso.tech): guarda o banco de dados. O Turso é um SQLite na nuvem, igual ao banco que você usa no seu computador, só que fica salvo mesmo quando o site é publicado de novo.

Os dois têm plano gratuito, que costuma ser suficiente para um projeto pequeno. Confira os limites atuais nas páginas de preços deles. Hoje o plano gratuito da Vercel (Hobby) é para uso pessoal e sem fins lucrativos; se o RotaU virar um negócio, vale rever isso.

Por que dois serviços? A Vercel apaga qualquer arquivo salvo no servidor entre uma visita e outra, então o banco não pode ficar num arquivo como no seu computador. Por isso o banco fica no Turso.

## O que já está pronto no repositório

- `site/vercel.json`: diz à Vercel como compilar o site e que as chamadas `/api/...` vão para a API.
- `site/api/index.ts`: a API do RotaU como função da Vercel.
- `site/server/db.ts`: usa o banco do Turso quando a variável `DATABASE_URL` existe, e um arquivo local no seu computador quando não existe. Para desenvolver no seu computador, nada muda: `pnpm dev` continua funcionando.

Você não precisa mexer nesses arquivos.

## Passo 1: criar o banco gratuito no Turso

1. Entre em https://turso.tech e clique em **Sign Up**. Escolha entrar com o **GitHub**.
2. No painel, clique em **Create Database** e dê o nome `rotau`.
3. Escolha a região mais perto de você (por exemplo, a América do Sul ou a Costa Leste dos EUA) e crie.
4. Abra o banco criado e copie a **URL**. Ela começa com `libsql://` (exemplo: `libsql://rotau-seunome.turso.io`).
5. Gere um **token** de acesso (botão **Generate Token** ou **Create Token** na página do banco). Escolha acesso de leitura e escrita, sem validade, e copie o texto grande que aparece. Ele só é mostrado uma vez.

Guarde a URL e o token num lugar seguro. O token é como uma senha do banco: nunca coloque no GitHub.

Não precisa criar tabelas nem cadastrar faculdades: o RotaU cria as tabelas e a lista de faculdades (UniFacens, Fatec, Ufscar, Uniso e Unip) sozinho na primeira visita.

## Passo 2: criar a conta na Vercel e importar o projeto

1. Entre em https://vercel.com e clique em **Sign Up**. Escolha o plano **Hobby** (gratuito) e entre com o **GitHub**.
2. No painel, clique em **Add New → Project**.
3. Em **Import Git Repository**, clique em **Adjust GitHub App Permissions** se o repositório **UPX** não aparecer, autorize a Vercel nele e depois clique em **Import** ao lado do UPX.
4. Na tela de configuração, procure **Root Directory** e clique em **Edit**. Escolha a pasta **site** e confirme. **Este passo é essencial**, porque o site fica dentro dessa pasta.
5. Em **Framework Preset**, deve aparecer **Vite**. Não mude o resto.

## Passo 3: colocar as variáveis (ainda na mesma tela)

Abra **Environment Variables** e adicione uma por vez (nome, valor, **Add**):

| Nome | Valor | Para que serve |
| --- | --- | --- |
| `DATABASE_URL` | a URL do Turso (`libsql://...`) | Onde o banco está. |
| `DATABASE_AUTH_TOKEN` | o token do Turso | Senha de acesso ao banco. |
| `ADMIN_PASSWORD` | uma senha forte inventada por você | Senha do painel `/admin`. Sem ela, o painel fica desativado. |
| `TRUST_PROXY` | `1` | Faz o login funcionar direito atrás do HTTPS da Vercel (cookie seguro e limite de tentativas por visitante). |
| `SEED` | `false` | **Importante:** sem isso o banco ganha motoristas e estudantes de exemplo com senha conhecida (`rotau1234`). As faculdades da lista do cadastro são criadas sempre, com ou sem esta variável. |
| `DEMO_VANS` | *(não crie por enquanto)* | Só quando houver motoristas reais: `false` apaga as vans fictícias de demonstração (veja "Vans de demonstração" abaixo). |

Depois clique em **Deploy**. A primeira publicação leva uns 1 a 2 minutos.

## Passo 4: conferir se funcionou

1. Quando a Vercel mostrar **Congratulations**, clique em **Visit** (ou no endereço `rotau-xxxx.vercel.app`).
2. O site do RotaU deve abrir. Abra também `https://SEU-ENDERECO/api/health`: deve aparecer `{"ok":true}`.
3. Faça um cadastro de teste (estudante ou motorista, com senha) e depois saia e entre de novo com o mesmo e-mail e senha. No painel do Turso (aba **Data** do banco), as tabelas `students` e `drivers` devem mostrar o cadastro.
4. O painel de administração fica em `https://SEU-ENDERECO/admin` e pede a senha configurada em `ADMIN_PASSWORD`.

## Vans de demonstração (fictícias)

Para a busca nunca ficar vazia, o RotaU cria sozinho **11 vans fictícias de demonstração** que cobrem toda a região de Sorocaba (Centro e as quatro zonas de Sorocaba, Votorantim, Itu, Salto, Porto Feliz, Boituva, Tatuí, Iperó, Itapetininga, São Roque, Mairinque e outras cidades vizinhas) e atendem **todas as faculdades** da lista, inclusive as que forem cadastradas depois.

- Elas aparecem com **"(demo)"** no nome do motorista. Os motoristas não existem.
- São criadas mesmo com `SEED=false`, e só uma vez (publicar de novo não duplica).
- **Ninguém consegue entrar nessas contas:** elas não têm senha, então o login sempre falha.
- Um estudante pode reservar vaga numa van de demonstração, mas ninguém vai confirmar a reserva.

**Como remover quando houver motoristas reais:** na Vercel, abra **Settings → Environment Variables**, crie a variável `DEMO_VANS` com o valor `false` e faça **Redeploy**. Na próxima visita ao site, as vans de demonstração (e as reservas feitas nelas) são apagadas. Os motoristas reais não são afetados. Enquanto `DEMO_VANS=false` existir, elas não voltam.

## Passo 5 (opcional): domínio próprio

1. Compre o domínio num registrador (para `.com.br`, use https://registro.br). O domínio é a única parte paga.
2. Na Vercel, abra o projeto, vá em **Settings → Domains**, digite o domínio (ex.: `rotau.com.br`) e clique em **Add**.
3. A Vercel mostra os registros de DNS que você precisa criar (um **A** e/ou um **CNAME**). Copie esses valores.
4. No site do registrador, abra a configuração de **DNS** e crie os mesmos registros.
5. Espere de alguns minutos a algumas horas. Quando a Vercel mostrar o domínio como válido, o site abre por ele, com cadeado (HTTPS) automático.

## Como atualizar o site depois

Toda vez que uma mudança entra na branch `main` do GitHub (por exemplo, ao juntar um pull request), a Vercel publica a nova versão sozinha. Os dados no Turso não são apagados.

Cada pull request também ganha um endereço de teste próprio na Vercel, útil para ver a mudança antes de juntar. Atenção: esses endereços usam o mesmo banco de produção, a menos que você crie outro banco só para testes e configure as variáveis apenas para o ambiente **Preview**.

## Se algo der errado

- **A publicação falhou:** na Vercel, abra **Deployments**, clique na publicação com erro e leia o **Build Logs**. Copie a mensagem e peça ajuda com ela.
- **A lista de faculdades do cadastro está vazia:** isso acontecia em versões antigas do site com `SEED=false`. Na versão atual, a lista é criada sozinha. Depois que a publicação mais recente estiver **Ready**, abra o site e recarregue a página (`Ctrl + Shift + R`). Se ainda estiver vazia, abra `https://SEU-ENDERECO/api/colleges`: deve aparecer uma lista com 5 faculdades. Se aparecer um erro, me mande o texto.
- **O site abre, mas o cadastro dá erro:** abra **Logs** do projeto na Vercel. Se falar de `DATABASE_URL`, a variável não foi criada ou está com o valor errado. Corrija em **Settings → Environment Variables** e faça **Redeploy** (em **Deployments**, menu de três pontinhos).
- **Página não encontrada em `/admin` ou ao recarregar:** confira se o **Root Directory** é `site` (Passo 2).
- **O painel `/admin` abre sem pedir senha:** a variável `ADMIN_PASSWORD` não foi criada (nesse caso o painel deveria aparecer desativado). Crie e faça **Redeploy**.
- **Variáveis novas não têm efeito:** a Vercel só lê variáveis novas em publicações novas. Sempre faça **Redeploy** depois de mudar.

## Desenvolvimento no seu computador

Nada muda: `pnpm dev` na pasta `site` usa um arquivo local (`server/data/rotau.db`). Para apontar o computador para o banco do Turso, defina `DATABASE_URL` e `DATABASE_AUTH_TOKEN` antes de rodar. Cuidado: assim você mexe nos dados reais.
