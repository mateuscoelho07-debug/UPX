# UPX — RotaU

O RotaU conecta estudantes a motoristas de vans universitárias. O site fica em [`Site para RotaU/`](Site%20para%20RotaU).

## Como rodar

Requer Node.js 22.13 ou mais novo (o banco usa o SQLite embutido no Node) e pnpm.

```bash
cd "Site para RotaU"
pnpm install
pnpm dev        # sobe a API (porta 3001) e o site (porta 8443) juntos
```

Outros comandos:

- `pnpm server`: só a API.
- `pnpm start`: compila o site e serve site + API juntos na porta 3001 (modo produção).
- `pnpm test:api`: testes da API.

O banco é criado automaticamente em `server/data/rotau.db` na primeira execução, já com as faculdades e alguns motoristas e passageiros de exemplo. Para começar do zero, apague esse arquivo. Variáveis opcionais: `DB_PATH` (outro arquivo de banco), `API_PORT` (porta da API) e `SEED=false` (não criar dados de exemplo).

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
