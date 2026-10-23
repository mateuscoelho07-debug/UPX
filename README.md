# UPX — RotaU

O RotaU conecta estudantes a motoristas de vans universitárias. O site fica em [`Site para RotaU/`](Site%20para%20RotaU).

## Como rodar

Requer Node.js 22.18 ou mais novo (o banco usa o SQLite embutido no Node e a API é escrita em TypeScript, executado direto pelo Node) e pnpm.

```bash
cd "Site para RotaU"
pnpm install
pnpm dev        # sobe a API (porta 3001) e o site (porta 8443) juntos
```

Outros comandos:

- `pnpm api`: só a API.
- `pnpm start`: compila o site e serve site + API juntos na porta 3001 (modo produção).
- `pnpm test:api`: testes da API.
- `pnpm typecheck`: verificação de tipos do site e da API.

O banco é criado automaticamente em `server/data/rotau.db` na primeira execução, já com as faculdades e alguns motoristas e passageiros de exemplo. Para começar do zero, apague esse arquivo. Variáveis opcionais: `DB_PATH` (outro arquivo de banco), `API_PORT` (porta da API), `SEED=false` (não criar dados de exemplo) e `ADMIN_PASSWORD` (senha do painel `/admin`, veja abaixo).

As contas de exemplo usam a senha `rotau1234` (por exemplo, motorista `carlos@rotau.com` ou estudante `mariana@email.com`). Contas criadas antes do login com senha não têm senha e não conseguem entrar: cadastre de novo ou apague o banco.

## Banco de dados

O esquema completo está em [`server/schema.sql`](Site%20para%20RotaU/server/schema.sql):

| Tabela | O que guarda |
| --- | --- |
| `colleges` | Faculdades (UniFacens, Fatec, Ufscar, Uniso, Unip e as que os motoristas cadastrarem) |
| `students` | Estudantes: nome, celular, e-mail, endereço, faculdade e hash da senha |
| `drivers` | Motoristas e vans: modelo, placa, lugares, horário de saída, nota e hash da senha |
| `driver_cities` | Cidades por onde cada motorista passa, na ordem da rota |
| `driver_colleges` | Faculdades que cada motorista atende |
| `bookings` | Reservas de vaga (estudante ↔ van), com status `Aguardando`, `Confirmado` ou `Cancelado` |
| `searches` | Buscas feitas na página inicial, para medir a demanda |
| `sessions` | Sessões de login abertas (só o hash do token, com data de expiração) |

## Login e segurança

- Estudantes e motoristas criam uma senha no cadastro (mínimo de 8 caracteres) e entram com e-mail e senha. As senhas são guardadas com **scrypt** e sal aleatório, nunca em texto.
- A sessão fica num cookie `rotau_session` **httpOnly** e `SameSite=Lax`, válido por 30 dias. O banco guarda só o hash do token, então "Sair" encerra a sessão de verdade.
- Cada usuário só acessa os próprios dados: o estudante vê e reserva só para si, e o motorista só vê o próprio painel e só confirma ou recusa reservas da própria van.
- Requisições que alteram dados precisam ser JSON (bloqueia formulários de outros sites) e o login trava por 15 minutos depois de 10 tentativas erradas.
- Em produção, atrás de HTTPS: defina `TRUST_PROXY=1` (se houver um proxy na frente, como na maioria das hospedagens) ou `COOKIE_SECURE=true`, para o cookie sair com a flag `Secure`. Use também `SEED=false` para não criar as contas de exemplo.

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
| POST | `/api/bookings` | Estudante logado reserva uma vaga (`driverId`) |
| PATCH | `/api/bookings/:id` | Motorista da van confirma ou recusa (`status`, `pickupTime`) |
| POST | `/api/admin/login` | Login do painel de administração (`password`) |

## Painel de administração

Abra `http://localhost:8443/admin` (ou `http://localhost:3001/admin` com `pnpm start`). Ele mostra, somente para consulta, todos os estudantes, motoristas, reservas, faculdades e buscas salvos no banco, com filtro.

O painel exige a senha definida na variável `ADMIN_PASSWORD` do servidor (o nome antigo, `ADMIN_TOKEN`, também funciona). Sem essa variável o painel fica desativado. Para usar localmente:

```bash
ADMIN_PASSWORD=uma-senha-forte pnpm dev
```
