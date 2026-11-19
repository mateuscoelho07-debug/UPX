# Usuários de demonstração (UPX)

Contas de teste para apresentar o RotaU. São criadas sozinhas quando o site abre o banco (inclusive na Vercel), uma vez só: publicar de novo não duplica. **Todas usam a senha `rotau1234`**, entram pelo botão **Entrar** da página inicial, escolhendo **Motorista** ou **Estudante**.

- São **9 motoristas** e **45 alunos** (5 por motorista). Todos os alunos estudam na **UniFacens**, e os motoristas atendem todas as faculdades da lista.
- Os e-mails terminam em `@rotau.test`, um domínio reservado que nunca existe de verdade: nenhum e-mail é enviado. Também não dá para criar conta nova com esse domínio.
- Os alunos fictícios ("(demo)" no nome) contam como **"Vou hoje"** todos os dias. O **EstudanteUpx** não: ele responde "Vou" ou "Não vou" no painel, como um aluno de verdade.
- Os nomes com "(demo)" e os endereços dos alunos fictícios são inventados. As posições no mapa são fixas, para a rota dar sempre o mesmo resultado. Os endereços do MotoUpx e do EstudanteUpx são procurados no mapa (OpenStreetMap) quando as contas são criadas; se o mapa não responder, ficam numa posição aproximada da região.
- Para apagar todas as contas de demonstração, crie a variável `DEMO_VANS=false` na Vercel e publique de novo.

## Roteiro rápido da apresentação

1. Entre como **MotoUpx** (motorista). No topo estão **Iniciar rota** e **Quem vai na rota**: a ida sai da casa do motorista (Avenida Paraná, 4495) e passa por cada aluno, com o tempo e a distância de cada trecho. Toque num endereço para copiar.
2. Em outra janela (ou aba anônima), entre como **EstudanteUpx** (estudante) e toque em **Vou hoje**. Ele entra na rota do MotoUpx.
3. No MotoUpx, toque em **Iniciar ida**. O EstudanteUpx recebe o aviso com a previsão no sino.
4. Toque em **Cheguei na faculdade · Finalizar**. A presença é zerada e o EstudanteUpx volta a ver **Vou hoje / Não vou hoje** (para dizer se volta com a van).
5. No painel do EstudanteUpx, embaixo, as vans aparecem com **entrada na van**, **chegada na faculdade** e **chegada em casa**; a de **chegada mais rápida** fica em destaque.
6. No MotoUpx, **Meu perfil** mostra o e-mail e os dados e permite mudar o endereço de saída, o telefone, os horários e as cidades.

## Motoristas

| #   | Nome                   | E-mail (login)          | Senha       | Endereço de saída da van                          | Van                            | Placa    | Ida   | Volta | Cidades                                   |
| --- | ---------------------- | ----------------------- | ----------- | ------------------------------------------------- | ------------------------------ | -------- | ----- | ----- | ----------------------------------------- |
| 1   | MotoUpx                | `motoupx@rotau.test`    | `rotau1234` | Avenida Paraná, 4495 - Sorocaba                   | Renault Master (15 lugares)    | UPX-1A01 | 17:50 | 22:40 | Sorocaba (Zona Norte), Sorocaba           |
| 2   | Paulo Mendes (demo)    | `motorista2@rotau.test` | `rotau1234` | Rua Barão de Piratininga, 500 - Centro (Sorocaba) | Mercedes Sprinter (15 lugares) | DEM-2B02 | 17:40 | 22:40 | Sorocaba (Centro), Vila Hortência         |
| 3   | Juliana Prado (demo)   | `motorista3@rotau.test` | `rotau1234` | Av. São Paulo, 1200 - Zona Sul (Sorocaba)         | Fiat Ducato (14 lugares)       | DEM-3C03 | 17:35 | 22:40 | Sorocaba (Zona Sul), Campolim, Jd. Europa |
| 4   | Marcos Teixeira (demo) | `motorista4@rotau.test` | `rotau1234` | Rua Bela Vista, 900 - Brigadeiro Tobias           | Peugeot Boxer (14 lugares)     | DEM-4D04 | 17:45 | 22:40 | Sorocaba (Zona Leste), Brigadeiro Tobias  |
| 5   | Sandra Oliveira (demo) | `motorista5@rotau.test` | `rotau1234` | Rua São João, 1500 - Wanel Ville                  | Renault Master (15 lugares)    | DEM-5E05 | 17:30 | 22:40 | Sorocaba (Zona Oeste), Wanel Ville        |
| 6   | Cláudia Ramos (demo)   | `motorista6@rotau.test` | `rotau1234` | Rua do Comércio, 1000 - Votorantim                | Mercedes Sprinter (16 lugares) | DEM-6F06 | 17:15 | 22:40 | Votorantim, Salto de Pirapora             |
| 7   | André Fonseca (demo)   | `motorista7@rotau.test` | `rotau1234` | Av. São Paulo, 300 - Itu                          | Iveco Daily (16 lugares)       | DEM-7G07 | 16:50 | 22:40 | Itu, Salto                                |
| 8   | Beatriz Campos (demo)  | `motorista8@rotau.test` | `rotau1234` | Av. Independência, 50 - Porto Feliz               | Fiat Ducato (14 lugares)       | DEM-8H08 | 16:45 | 22:40 | Porto Feliz, Boituva                      |
| 9   | Rogério Lima (demo)    | `motorista9@rotau.test` | `rotau1234` | Rua Floriano Peixoto, 100 - Araçoiaba da Serra    | Renault Master (15 lugares)    | DEM-9J09 | 16:50 | 22:40 | Araçoiaba da Serra, Iperó                 |

## Alunos (por motorista)

Todos com a senha `rotau1234`, faculdade UniFacens e celular (15) 90000-0000. A reserva já vem **confirmada** na van do motorista.

### 1. MotoUpx

| Nome                 | E-mail (login)            | Senha       | Endereço                                                        |
| -------------------- | ------------------------- | ----------- | --------------------------------------------------------------- |
| EstudanteUpx         | `estudanteupx@rotau.test` | `rotau1234` | Rua José Leite do Canto Júnior, 441 - Jardim Montreal, Sorocaba |
| Aline Dias (demo)    | `aluno1-2@rotau.test`     | `rotau1234` | Rua das Acácias, 210 - Zona Norte (Sorocaba)                    |
| Bruno Moreira (demo) | `aluno1-3@rotau.test`     | `rotau1234` | Rua dos Ipês, 95 - Itavuvu                                      |
| Camila Uchoa (demo)  | `aluno1-4@rotau.test`     | `rotau1234` | Rua Minas Gerais, 318 - Zona Norte (Sorocaba)                   |
| Diego Freitas (demo) | `aluno1-5@rotau.test`     | `rotau1234` | Rua do Comércio, 77 - Zona Norte (Sorocaba)                     |

### 2. Paulo Mendes (demo)

| Nome                      | E-mail (login)        | Senha       | Endereço                                      |
| ------------------------- | --------------------- | ----------- | --------------------------------------------- |
| Eduarda Nascimento (demo) | `aluno2-1@rotau.test` | `rotau1234` | Rua das Acácias, 596 - Centro (Sorocaba)      |
| Felipe Vieira (demo)      | `aluno2-2@rotau.test` | `rotau1234` | Rua XV de Novembro, 896 - Vila Hortência      |
| Gabriela Gomes (demo)     | `aluno2-3@rotau.test` | `rotau1234` | Rua Floriano Peixoto, 748 - Centro (Sorocaba) |
| Henrique Pacheco (demo)   | `aluno2-4@rotau.test` | `rotau1234` | Rua São João, 718 - Vila Hortência            |
| Isabela Xavier (demo)     | `aluno2-5@rotau.test` | `rotau1234` | Rua Tiradentes, 171 - Jd. Faculdade           |

### 3. Juliana Prado (demo)

| Nome                    | E-mail (login)        | Senha       | Endereço                                 |
| ----------------------- | --------------------- | ----------- | ---------------------------------------- |
| João Heitor (demo)      | `aluno3-1@rotau.test` | `rotau1234` | Av. São Paulo, 741 - Zona Sul (Sorocaba) |
| Karen Queiroz (demo)    | `aluno3-2@rotau.test` | `rotau1234` | Rua Marechal Deodoro, 299 - Campolim     |
| Leonardo Almeida (demo) | `aluno3-3@rotau.test` | `rotau1234` | Av. Dom Pedro I, 876 - Jd. Europa        |
| Marcela Ibrahim (demo)  | `aluno3-4@rotau.test` | `rotau1234` | Rua Sete de Setembro, 218 - Campolim     |
| Nicolas Rocha (demo)    | `aluno3-5@rotau.test` | `rotau1234` | Rua Santa Rita, 740 - Jd. Europa         |

### 4. Marcos Teixeira (demo)

| Nome                      | E-mail (login)        | Senha       | Endereço                                       |
| ------------------------- | --------------------- | ----------- | ---------------------------------------------- |
| Otávio Barbosa (demo)     | `aluno4-1@rotau.test` | `rotau1234` | Av. Independência, 764 - Zona Leste (Sorocaba) |
| Patrícia Junqueira (demo) | `aluno4-2@rotau.test` | `rotau1234` | Rua Bela Vista, 538 - Brigadeiro Tobias        |
| Rafael Santana (demo)     | `aluno4-3@rotau.test` | `rotau1234` | Rua das Orquídeas, 371 - Zona Leste (Sorocaba) |
| Sabrina Cardoso (demo)    | `aluno4-4@rotau.test` | `rotau1234` | Rua das Laranjeiras, 356 - Brigadeiro Tobias   |
| Thiago Lopes (demo)       | `aluno4-5@rotau.test` | `rotau1234` | Av. Brasil, 850 - Zona Leste (Sorocaba)        |

### 5. Sandra Oliveira (demo)

| Nome                   | E-mail (login)        | Senha       | Endereço                                          |
| ---------------------- | --------------------- | ----------- | ------------------------------------------------- |
| Vanessa Tavares (demo) | `aluno5-1@rotau.test` | `rotau1234` | Rua das Acácias, 241 - Zona Oeste (Sorocaba)      |
| Wesley Dias (demo)     | `aluno5-2@rotau.test` | `rotau1234` | Rua XV de Novembro, 24 - Wanel Ville              |
| Yasmin Moreira (demo)  | `aluno5-3@rotau.test` | `rotau1234` | Rua Tiradentes, 387 - Wanel Ville                 |
| Caio Uchoa (demo)      | `aluno5-4@rotau.test` | `rotau1234` | Rua Floriano Peixoto, 441 - Zona Oeste (Sorocaba) |
| Larissa Freitas (demo) | `aluno5-5@rotau.test` | `rotau1234` | Rua São João, 559 - Wanel Ville                   |

### 6. Cláudia Ramos (demo)

| Nome                     | E-mail (login)        | Senha       | Endereço                              |
| ------------------------ | --------------------- | ----------- | ------------------------------------- |
| Murilo Nascimento (demo) | `aluno6-1@rotau.test` | `rotau1234` | Rua do Comércio, 507 - Votorantim     |
| Natália Vieira (demo)    | `aluno6-2@rotau.test` | `rotau1234` | Rua Minas Gerais, 604 - Votorantim    |
| Vitor Gomes (demo)       | `aluno6-3@rotau.test` | `rotau1234` | Rua dos Ipês, 859 - Salto de Pirapora |
| Letícia Pacheco (demo)   | `aluno6-4@rotau.test` | `rotau1234` | Rua das Palmeiras, 120 - Votorantim   |
| Renan Xavier (demo)      | `aluno6-5@rotau.test` | `rotau1234` | Rua dos Jasmins, 88 - Votorantim      |

### 7. André Fonseca (demo)

| Nome                  | E-mail (login)        | Senha       | Endereço                          |
| --------------------- | --------------------- | ----------- | --------------------------------- |
| Bianca Heitor (demo)  | `aluno7-1@rotau.test` | `rotau1234` | Av. São Paulo, 728 - Itu          |
| Aline Queiroz (demo)  | `aluno7-2@rotau.test` | `rotau1234` | Rua Marechal Deodoro, 717 - Salto |
| Bruno Almeida (demo)  | `aluno7-3@rotau.test` | `rotau1234` | Av. Dom Pedro I, 187 - Itu        |
| Camila Ibrahim (demo) | `aluno7-4@rotau.test` | `rotau1234` | Rua Sete de Setembro, 778 - Salto |
| Diego Rocha (demo)    | `aluno7-5@rotau.test` | `rotau1234` | Rua Santa Rita, 95 - Itu          |

### 8. Beatriz Campos (demo)

| Nome                    | E-mail (login)        | Senha       | Endereço                              |
| ----------------------- | --------------------- | ----------- | ------------------------------------- |
| Eduarda Barbosa (demo)  | `aluno8-1@rotau.test` | `rotau1234` | Av. Independência, 234 - Porto Feliz  |
| Felipe Junqueira (demo) | `aluno8-2@rotau.test` | `rotau1234` | Rua Bela Vista, 292 - Boituva         |
| Gabriela Santana (demo) | `aluno8-3@rotau.test` | `rotau1234` | Av. Brasil, 747 - Porto Feliz         |
| Henrique Cardoso (demo) | `aluno8-4@rotau.test` | `rotau1234` | Rua das Orquídeas, 41 - Boituva       |
| Isabela Lopes (demo)    | `aluno8-5@rotau.test` | `rotau1234` | Rua das Laranjeiras, 27 - Porto Feliz |

### 9. Rogério Lima (demo)

| Nome                    | E-mail (login)        | Senha       | Endereço                                       |
| ----------------------- | --------------------- | ----------- | ---------------------------------------------- |
| João Tavares (demo)     | `aluno9-1@rotau.test` | `rotau1234` | Rua Floriano Peixoto, 449 - Araçoiaba da Serra |
| Karen Dias (demo)       | `aluno9-2@rotau.test` | `rotau1234` | Rua Tiradentes, 589 - Iperó                    |
| Leonardo Moreira (demo) | `aluno9-3@rotau.test` | `rotau1234` | Rua São João, 620 - Araçoiaba da Serra         |
| Marcela Uchoa (demo)    | `aluno9-4@rotau.test` | `rotau1234` | Rua XV de Novembro, 25 - Iperó                 |
| Nicolas Freitas (demo)  | `aluno9-5@rotau.test` | `rotau1234` | Rua das Acácias, 540 - Araçoiaba da Serra      |
