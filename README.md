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

O banco é criado automaticamente em `server/data/rotau.db` na primeira execução, já com as faculdades e alguns motoristas e passageiros de exemplo. Para começar do zero, apague esse arquivo. Variáveis opcionais: `DB_PATH` (outro arquivo de banco), `API_PORT` (porta da API) e `SEED=false` (não criar dados de exemplo).

## Publicar na internet

O passo a passo para colocar o site no ar (Railway, com banco persistente e domínio próprio) está em [`PUBLICAR.md`](PUBLICAR.md).

## Banco de dados

O esquema completo está em [`server/schema.sql`](Site%20para%20RotaU/server/schema.sql):

| Tabela | O que guarda |
| --- | --- |
| `colleges` | Faculdades (UniFacens, Fatec, Ufscar, Uniso, Unip e as que os motoristas cadastrarem) |
| `students` | Estudantes: nome, celular, e-mail, endereço e faculdade |
| `drivers` | Motoristas e vans: modelo, placa, lugares, horário de saída e nota |
| `driver_cities` | Cidades por onde cada motorista passa, na ordem da rota |
| `driver_colleges` | Faculdades que cada motorista atende |
| `bookings` | Reservas de vaga (estudante ↔ van), com status `Aguardando`, `Confirmado` ou `Cancelado` |
| `searches` | Buscas feitas na página inicial, para medir a demanda |

## API

| Método | Rota | Uso no site |
| --- | --- | --- |
| GET | `/api/colleges` | Lista de faculdades nos formulários |
| POST | `/api/searches` | Busca "Encontre sua van" |
| POST | `/api/students` | Cadastro de estudante |
| GET | `/api/students/:id` | Dados do estudante no painel |
| POST | `/api/drivers` | Cadastro de motorista |
| GET | `/api/drivers/:id/dashboard` | Painel do motorista (passageiros, vagas, destino) |
| GET | `/api/vans?studentId=` | Vans que atendem a faculdade do estudante |
| POST | `/api/bookings` | Estudante reserva uma vaga |
| PATCH | `/api/bookings/:id` | Motorista confirma ou recusa (`status`, `pickupTime`) |

## Painel de administração

Com o site rodando, abra `http://localhost:8443/admin` (ou `http://localhost:3001/admin` com `pnpm start`). Ele mostra, somente para consulta, todos os estudantes, motoristas, reservas, faculdades e buscas salvos no banco, com filtro.

**Atenção:** o painel ainda não tem login e foi feito para uso local. Antes de publicar o site, defina a variável `ADMIN_TOKEN` no servidor: a API passa a exigir esse token e o painel pede a senha para abrir.
