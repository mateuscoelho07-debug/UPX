# UPX — RotaU

O RotaU conecta estudantes a motoristas de vans universitárias. O site fica em [`site/`](site).

## Como rodar

O RotaU é um projeto **Angular 22** (telas com componentes standalone) com **Angular SSR**: o servidor do Angular (Express, em `src/server.ts`) também hospeda a API em TypeScript (`src/server/`). O banco é SQLite via libSQL (Turso em produção). Requer Node.js 24 e pnpm.

```bash
cd site
pnpm install
pnpm dev        # site + API juntos em http://localhost:8443 (ng serve)
```

Outros comandos:

- `pnpm build`: compila o site e o servidor (`dist/rotau`).
- `pnpm start`: compila e roda o servidor de produção na porta 3001.
- `pnpm test`: testes do front end Angular (Vitest).
- `pnpm test:api`: testes da API.
- `pnpm typecheck`: verificação de tipos do site e da API.

O banco é criado automaticamente em `data/rotau.db` na primeira execução, já com as faculdades e alguns motoristas e passageiros de exemplo. Para começar do zero, apague esse arquivo. Variáveis opcionais: `DB_PATH` (outro arquivo de banco), `DATABASE_URL` e `DATABASE_AUTH_TOKEN` (usar um banco do Turso em vez do arquivo local), `PORT` (porta do servidor de produção), `SEED=false` (não criar os motoristas e estudantes de exemplo; as faculdades são criadas sempre), `DEMO_VANS=false` (apagar e não criar as 11 vans fictícias de demonstração, sem senha, que cobrem a região de Sorocaba e todas as faculdades; elas são criadas por padrão, mesmo com `SEED=false`) e `ADMIN_PASSWORD` (senha do painel `/admin`, veja abaixo).

As contas de exemplo usam a senha `rotau1234` (por exemplo, motorista `carlos@rotau.com` ou estudante `mariana@email.com`). Contas criadas antes do login com senha não têm senha e não conseguem entrar: cadastre de novo ou apague o banco.

## Publicar na internet

O passo a passo para colocar o site no ar (gratuito, com Vercel e Turso, incluindo domínio próprio) está em [`PUBLICAR.md`](PUBLICAR.md).

## Banco de dados

O esquema completo está em [`site/src/server/schema.ts`](site/src/server/schema.ts):

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

## Login e segurança

- Estudantes e motoristas criam uma senha no cadastro (mínimo de 8 caracteres) e entram com e-mail e senha. As senhas são guardadas com **scrypt** e sal aleatório, nunca em texto.
- A sessão fica num cookie `rotau_session` **httpOnly** e `SameSite=Lax`, válido por 30 dias. O banco guarda só o hash do token, então "Sair" encerra a sessão de verdade.
- Cada usuário só acessa os próprios dados: o estudante vê e reserva só para si, e o motorista só vê o próprio painel e só confirma ou recusa reservas da própria van.
- Requisições que alteram dados precisam ser JSON (bloqueia formulários de outros sites) e o login trava por 15 minutos depois de 10 tentativas erradas.
- Em produção, atrás de HTTPS: defina `TRUST_PROXY=1` (se houver um proxy na frente, como na maioria das hospedagens) ou `COOKIE_SECURE=true`, para o cookie sair com a flag `Secure`. Use também `SEED=false` para não criar as contas de exemplo (as faculdades continuam sendo criadas).

## API

| Método | Rota | Uso no site |
| --- | --- | --- |
| GET | `/api/colleges` | Lista de faculdades nos formulários |
| POST | `/api/searches` | Busca "Encontre sua van" |
| POST | `/api/students` | Cadastro de estudante (com `password`; já deixa logado) |
| GET | `/api/students/:id` | Dados do estudante no painel (só o próprio) |
| POST | `/api/drivers` | Cadastro de motorista (com `password`; já deixa logado) |
| GET | `/api/drivers/:id/dashboard` | Painel do motorista (só o próprio) |
| POST | `/api/auth/login` | Login (`profile`: `student` ou `driver`, `email`, `password`) |
| POST | `/api/auth/logout` | Sair |
| GET | `/api/auth/me` | Usuário logado |
| GET | `/api/vans` | Vans que atendem a faculdade do estudante logado (`?college=` é público) |
| GET | `/api/vans/:id` | Página da van (só vans da faculdade do estudante logado; o telefone só aparece após reservar) |
| POST | `/api/bookings` | Estudante logado reserva uma vaga (`driverId`). Cada estudante fica em uma van só: com outra reserva ativa dá 409, a menos que envie `replace: true` (troca de van) |
| POST | `/api/bookings/:id/cancel` | Estudante cancela a própria reserva |
| POST | `/api/account/delete` | Estudante ou motorista logado exclui a própria conta (`password` para confirmar) |
| PATCH | `/api/bookings/:id` | Motorista da van confirma ou recusa (`status`, `pickupTime`) |
| POST | `/api/drivers/:id/route-runs` | Motorista inicia a `ida` ou a `volta` do dia (`leg`); avisa quem vai hoje |
| GET | `/api/attendance/today` | Estudante: presença de hoje, van e horários de ida e volta |
| PUT | `/api/attendance/today` | Estudante diz se vai hoje (`going`: true ou false) |
| GET | `/api/notifications` | Avisos do usuário logado (sino) |
| POST | `/api/notifications/read` | Marca os avisos como lidos |
| POST | `/api/admin/login` | Login do painel de administração (`password`) |

## Painel de administração

Abra `http://localhost:8443/admin` (ou `http://localhost:3001/admin` com `pnpm start`). Ele mostra, somente para consulta, todos os estudantes, motoristas, reservas, faculdades e buscas salvos no banco, com filtro.

O painel exige a senha definida na variável `ADMIN_PASSWORD` do servidor (o nome antigo, `ADMIN_TOKEN`, também funciona). Sem essa variável o painel fica desativado. Para usar localmente:

```bash
ADMIN_PASSWORD=uma-senha-forte pnpm dev
```
