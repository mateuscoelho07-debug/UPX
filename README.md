# UPX — RotaU

O **RotaU** conecta estudantes universitários a motoristas de vans na região de Sorocaba. O estudante informa onde mora e a faculdade, encontra vans que atendem a rota, reserva a vaga e confirma todo dia se vai. O motorista vê quem vai, inicia a ida ou a volta e os alunos recebem a previsão de chegada.

## Tecnologias

- **Angular 22** (componentes standalone, signals) com **Tailwind CSS 4** nas telas.
- **Angular SSR**: o servidor do Angular (Express) também hospeda a **API REST** em TypeScript.
- **libSQL/SQLite**: arquivo local no desenvolvimento e **Turso** em produção.
- **Vercel** para publicar o site e a API.
- Testes com **Vitest** (telas) e `node:test` (API); formatação com **Prettier**.

## Estrutura do repositório

```
.
├── .github/workflows/ci.yml   # verificação automática (formatação, tipos, testes e build)
├── docs/
│   └── PUBLICAR.md            # guia de publicação (Vercel + Turso) e explicação dos recursos
└── site/                      # projeto Angular (front end + API)
    ├── api/index.js           # função da Vercel que chama o servidor do Angular
    ├── public/                # logo e ícone
    ├── src/
    │   ├── app/               # telas (front end)
    │   │   ├── home/          # página inicial: busca, cadastro e login
    │   │   ├── dashboard/     # painéis do estudante e do motorista e seus cartões
    │   │   ├── admin/         # painel de administração (/admin)
    │   │   ├── terms/         # página "Termos e Segurança"
    │   │   ├── shared/        # componentes e funções reaproveitados (ícones, campo, logo, formatação)
    │   │   └── api.service.ts # chamadas à API e tipos usados pelas telas
    │   ├── server/            # API e regras de negócio
    │   │   ├── api.ts         # rotas /api/* (validação de login e permissões)
    │   │   ├── db.ts          # acesso ao banco (todas as consultas SQL)
    │   │   ├── schema.ts      # tabelas do banco
    │   │   ├── auth.ts        # senhas (scrypt), sessões e limite de tentativas
    │   │   ├── route.ts       # cálculo da ordem das paradas e da previsão de chegada
    │   │   ├── places.ts      # coordenadas aproximadas de bairros, cidades e faculdades
    │   │   ├── geocode.ts     # localização do endereço pelo OpenStreetMap (Nominatim)
    │   │   ├── subscription.ts # assinatura mensal do motorista
    │   │   ├── terms.ts, pdf.ts # texto dos termos e geração do PDF
    │   │   ├── documents.ts   # validação da CNH e do CRLV enviados
    │   │   ├── demo.ts        # alunos fictícios de demonstração
    │   │   ├── time.ts        # datas e horários no fuso de Brasília
    │   │   └── *.test.ts      # testes da API
    │   ├── shared/            # código usado pelo front end e pela API (lista de faculdades)
    │   ├── server.ts          # servidor Express: API + páginas do Angular
    │   └── main.ts            # início do app no navegador
    ├── angular.json, package.json, tsconfig*.json
    └── vercel.json            # configuração da publicação
```

## Como rodar

Requer **Node.js 24** e **pnpm**.

```bash
cd site
pnpm install
pnpm dev        # site + API juntos em http://localhost:8443
```

| Comando | O que faz |
| --- | --- |
| `pnpm dev` | Servidor de desenvolvimento (site + API) |
| `pnpm build` | Compila o site e o servidor em `dist/rotau` |
| `pnpm start` | Compila e roda o servidor de produção na porta 3001 |
| `pnpm test` | Testes das telas (Vitest) |
| `pnpm test:api` | Testes da API |
| `pnpm typecheck` | Verificação de tipos do site e da API |
| `pnpm format` / `pnpm format:check` | Formata o código / confere a formatação (Prettier) |

O banco é criado automaticamente em `site/data/rotau.db` na primeira execução, já com as faculdades e contas de exemplo. Para começar do zero, apague esse arquivo. As contas de exemplo usam a senha `rotau1234` (por exemplo, motorista `carlos@rotau.com` ou estudante `mariana@email.com`).

## Variáveis de ambiente

Todas são opcionais no computador. Em produção, veja o [guia de publicação](docs/PUBLICAR.md).

| Variável | Para que serve |
| --- | --- |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | Usar um banco do Turso em vez do arquivo local (obrigatórias na Vercel) |
| `DB_PATH` | Outro arquivo de banco local |
| `PORT` | Porta do servidor de produção (padrão 3001) |
| `ADMIN_PASSWORD` | Senha do painel `/admin` (o nome antigo `ADMIN_TOKEN` também funciona); sem ela o painel fica desativado |
| `SEED=false` | Não cria as contas de exemplo (as faculdades são criadas sempre) |
| `DEMO_VANS=false` | Apaga e deixa de criar as 11 vans fictícias de demonstração e seus alunos |
| `CORINGA_DRIVERS` | Motoristas reais que recebem 3 alunos fictícios (nomes ou e-mails separados por vírgula; `off` desliga) |
| `GEOCODE=false` | Não consulta o OpenStreetMap para localizar endereços |
| `SUBSCRIPTION=off` | Desliga a assinatura mensal do motorista |
| `SUBSCRIPTION_PRICE`, `SUBSCRIPTION_DAYS` | Valor e duração da assinatura (padrão R$ 29,90 por 30 dias) |
| `SUBSCRIPTION_PAYMENT` | `simulado` (padrão): o botão de assinar não cobra de verdade |
| `TRUST_PROXY`, `COOKIE_SECURE=true` | Em produção atrás de HTTPS, para o cookie de sessão sair com a flag `Secure` |

## Banco de dados

O esquema completo está em [`site/src/server/schema.ts`](site/src/server/schema.ts). Colunas novas são criadas sozinhas em bancos antigos (função `migrate` em `db.ts`).

| Tabela | O que guarda |
| --- | --- |
| `colleges` | Faculdades da região de Sorocaba (UniFacens, Fatec, Ufscar, Uniso, Unip, Unesp, IFSP, PUC-SP, Anhanguera, ESAMC, Fadi, Ceunsp) e as que os motoristas cadastrarem |
| `students` | Estudantes: nome, celular, e-mail, endereço, faculdade e hash da senha |
| `drivers` | Motoristas e vans: modelo, placa, lugares, horário de saída, nota e hash da senha |
| `driver_cities` | Cidades por onde cada motorista passa, na ordem da rota |
| `driver_colleges` | Faculdades que cada motorista atende |
| `bookings` | Reservas de vaga (estudante ↔ van), com status `Aguardando`, `Confirmado` ou `Cancelado` |
| `searches` | Buscas feitas na página inicial, para medir a demanda |
| `sessions` | Sessões de login abertas (só o hash do token, com data de expiração) |
| `attendance` | Presença do dia: se o estudante vai ou não vai (uma resposta por estudante por dia, no horário de Brasília) |
| `route_runs` | Quando o motorista iniciou a ida ou a volta de cada dia |
| `notifications` | Avisos do sino do painel, para estudantes e motoristas |
| `driver_documents` | CNH e CRLV enviados pelo motorista (só ele acessa os arquivos) |

## Login e segurança

- Estudantes e motoristas criam uma senha no cadastro (mínimo de 8 caracteres) e entram com e-mail e senha. As senhas são guardadas com **scrypt** e sal aleatório, nunca em texto.
- A sessão fica num cookie `rotau_session` **httpOnly** e `SameSite=Lax`, válido por 30 dias. O banco guarda só o hash do token, então "Sair" encerra a sessão de verdade.
- Cada usuário só acessa os próprios dados: o estudante vê e reserva só para si, e o motorista só vê o próprio painel e só confirma ou recusa reservas da própria van.
- Requisições que alteram dados precisam ser JSON (bloqueia formulários de outros sites) e o login trava por 15 minutos depois de 10 tentativas erradas.
- Em produção, atrás de HTTPS: defina `TRUST_PROXY=1` (se houver um proxy na frente, como na maioria das hospedagens) ou `COOKIE_SECURE=true`, para o cookie sair com a flag `Secure`. Use também `SEED=false` para não criar as contas de exemplo (as faculdades continuam sendo criadas).

## API

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/api/health` | Verifica se a API está no ar |
| GET | `/api/colleges` | Lista de faculdades |
| POST | `/api/searches` | Busca "Encontre sua van" na página inicial |
| POST | `/api/students` | Cadastro de estudante (já deixa logado) |
| GET | `/api/students/:id` | Dados do estudante (só o próprio) |
| POST | `/api/drivers` | Cadastro de motorista (já deixa logado) |
| GET | `/api/drivers/:id` | Dados do motorista (só o próprio) |
| GET | `/api/drivers/:id/dashboard` | Painel do motorista: passageiros, presença e rota do dia |
| GET, POST | `/api/drivers/:id/subscription` | Consulta e paga (simulado) a assinatura mensal |
| GET | `/api/drivers/:id/documents` | Lista a CNH e o CRLV enviados |
| PUT, DELETE | `/api/drivers/:id/documents/:kind` | Envia ou remove um documento (`cnh` ou `crlv`) |
| GET | `/api/drivers/:id/documents/:kind/file` | Baixa o arquivo (só o próprio motorista) |
| POST | `/api/drivers/:id/terms-acceptance` | Aceite digital dos termos pelo motorista |
| POST | `/api/drivers/:id/route-runs` | Inicia a `ida` ou a `volta` do dia e avisa quem vai |
| GET | `/api/terms`, `/api/terms.pdf` | Texto dos termos e o PDF (com `?driverId=` traz o aceite do motorista) |
| POST | `/api/auth/login`, `/api/auth/logout` | Entrar e sair |
| GET | `/api/auth/me` | Usuário logado |
| POST | `/api/account/delete` | Exclui a própria conta (pede a senha) |
| GET | `/api/vans` | Vans que atendem a faculdade do estudante |
| GET | `/api/vans/:id` | Página da van (o telefone só aparece após reservar) |
| POST | `/api/bookings` | Reserva uma vaga; com outra reserva ativa dá 409, a menos que envie `replace: true` |
| POST | `/api/bookings/:id/cancel` | Estudante cancela a própria reserva |
| PATCH | `/api/bookings/:id` | Motorista confirma ou recusa (`status`, `pickupTime`) |
| GET, PUT | `/api/attendance/today` | Presença de hoje ("Vou hoje" / "Não vou hoje") |
| GET | `/api/notifications` | Avisos do sino |
| POST | `/api/notifications/read` | Marca os avisos como lidos |
| POST | `/api/admin/login` | Login do painel de administração |
| GET | `/api/admin/overview` | Conteúdo do banco para o `/admin` (somente leitura) |

## Painel de administração

Abra `http://localhost:8443/admin` (ou a porta 3001 com `pnpm start`). Ele mostra, somente para consulta, estudantes, motoristas, reservas, presenças, faculdades e buscas, com filtro. Exige a senha de `ADMIN_PASSWORD`:

```bash
ADMIN_PASSWORD=uma-senha-forte pnpm dev
```

## Publicar

O passo a passo para colocar o site no ar de graça (Vercel + Turso, com domínio próprio opcional) está em [`docs/PUBLICAR.md`](docs/PUBLICAR.md).
