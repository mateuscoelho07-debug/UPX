# Como publicar o RotaU de graça (Vercel + Turso)

Este guia coloca o RotaU na internet **sem pagar nada**, usando dois serviços:

- **Vercel** (vercel.com): hospeda o site e a API. Ele lê o código direto do seu GitHub e publica de novo a cada mudança.
- **Turso** (turso.tech): guarda o banco de dados. O Turso é um SQLite na nuvem, igual ao banco que você usa no seu computador, só que fica salvo mesmo quando o site é publicado de novo.

Os dois têm plano gratuito, que costuma ser suficiente para um projeto pequeno. Confira os limites atuais nas páginas de preços deles. Hoje o plano gratuito da Vercel (Hobby) é para uso pessoal e sem fins lucrativos; se o RotaU virar um negócio, vale rever isso.

Por que dois serviços? A Vercel apaga qualquer arquivo salvo no servidor entre uma visita e outra, então o banco não pode ficar num arquivo como no seu computador. Por isso o banco fica no Turso.

## O que já está pronto no repositório

O RotaU inteiro é um projeto **Angular** (a pasta `site`). O site (telas) e a API (o "back end") ficam no mesmo projeto: o Angular tem um servidor próprio (Angular SSR) e é ele que responde as chamadas `/api/...`.

- `site/vercel.json`: diz à Vercel onde fica o site compilado (`dist/rotau/browser`) e que tudo que não é arquivo vai para o servidor do Angular.
- `site/api/index.js`: a ponte que liga a Vercel ao servidor do Angular (`site/src/server.ts`).
- `site/src/server/`: a API do RotaU (rotas, login, banco). O arquivo `db.ts` usa o banco do Turso quando a variável `DATABASE_URL` existe, e um arquivo local no seu computador quando não existe. Para desenvolver no seu computador, nada muda: `pnpm dev` continua funcionando.

Você não precisa mexer nesses arquivos.

## Passo 1: criar o banco gratuito no Turso

1. Entre em https://turso.tech e clique em **Sign Up**. Escolha entrar com o **GitHub**.
2. No painel, clique em **Create Database** e dê o nome `rotau`.
3. Escolha a região mais perto de você (por exemplo, a América do Sul ou a Costa Leste dos EUA) e crie.
4. Abra o banco criado e copie a **URL**. Ela começa com `libsql://` (exemplo: `libsql://rotau-seunome.turso.io`).
5. Gere um **token** de acesso (botão **Generate Token** ou **Create Token** na página do banco). Escolha acesso de leitura e escrita, sem validade, e copie o texto grande que aparece. Ele só é mostrado uma vez.

Guarde a URL e o token num lugar seguro. O token é como uma senha do banco: nunca coloque no GitHub.

Não precisa criar tabelas nem cadastrar faculdades: o RotaU cria as tabelas e a lista de 12 faculdades da região de Sorocaba (UniFacens, Fatec, Ufscar, Uniso, Unip, Unesp, IFSP, PUC-SP, Anhanguera, ESAMC, Fadi e Ceunsp) sozinho na primeira visita. Se o banco já existia, as faculdades novas entram sozinhas na próxima publicação.

## Passo 2: criar a conta na Vercel e importar o projeto

1. Entre em https://vercel.com e clique em **Sign Up**. Escolha o plano **Hobby** (gratuito) e entre com o **GitHub**.
2. No painel, clique em **Add New → Project**.
3. Em **Import Git Repository**, clique em **Adjust GitHub App Permissions** se o repositório **UPX** não aparecer, autorize a Vercel nele e depois clique em **Import** ao lado do UPX.
4. Na tela de configuração, procure **Root Directory** e clique em **Edit**. Escolha a pasta **site** e confirme. **Este passo é essencial**, porque o site fica dentro dessa pasta.
5. Em **Framework Preset**, escolha **Other** (a Vercel pode mostrar "Angular" ou "Vite"; se aparecer outro, mude para **Other**). Não precisa mexer em Build Command nem em Output Directory: o arquivo `site/vercel.json` já preenche tudo (compila com `pnpm build` e publica a pasta `dist/rotau/browser`).
6. Em **Node.js Version** (em **Settings → General**, depois da primeira publicação, se ainda não estiver), deixe **24.x**. O Angular novo não roda no Node 20.

> **Mudou em relação à versão com React:** o Root Directory continua `site`, mas o Framework agora é **Other** (antes era Vite) e o Node precisa ser 24.x. Se o projeto já existia na Vercel, abra **Settings → General** e troque o Framework Preset para **Other**, confira o Node 24.x e faça um **Redeploy**.

## Passo 3: colocar as variáveis (ainda na mesma tela)

Abra **Environment Variables** e adicione uma por vez (nome, valor, **Add**):

| Nome | Valor | Para que serve |
| --- | --- | --- |
| `DATABASE_URL` | a URL do Turso (`libsql://...`) | Onde o banco está. |
| `DATABASE_AUTH_TOKEN` | o token do Turso | Senha de acesso ao banco. |
| `ADMIN_PASSWORD` | uma senha forte inventada por você | Senha do painel `/admin`. Sem ela, o painel fica desativado. |
| `TRUST_PROXY` | `1` | Faz o login funcionar direito atrás do HTTPS da Vercel (cookie seguro e limite de tentativas por visitante). |
| `SEED` | *(não é mais usada)* | Versões antigas criavam contas de exemplo; agora só existem as contas de demonstração (veja `DEMO_VANS`). Se ela já estiver lá, pode deixar ou apagar. |
| `DEMO_VANS` | *(não crie por enquanto)* | Só quando não precisar mais da demonstração: `false` apaga as contas de demonstração (veja "Contas de demonstração" abaixo). |
| `SUBSCRIPTION_PRICE` | *(opcional)* ex.: `29,90` | Valor da assinatura mensal do motorista, em reais. Sem ela, vale R$ 29,90. |
| `SUBSCRIPTION` | *(opcional)* `off` | `off` desliga a cobrança: todas as vans aparecem, como era antes. |

Depois clique em **Deploy**. A primeira publicação leva uns 1 a 2 minutos.

## Passo 4: conferir se funcionou

1. Quando a Vercel mostrar **Congratulations**, clique em **Visit** (ou no endereço `rotau-xxxx.vercel.app`).
2. O site do RotaU deve abrir. Abra também `https://SEU-ENDERECO/api/health`: deve aparecer `{"ok":true}`.
3. Faça um cadastro de teste (estudante ou motorista, com senha) e depois saia e entre de novo com o mesmo e-mail e senha. No painel do Turso (aba **Data** do banco), as tabelas `students` e `drivers` devem mostrar o cadastro.
4. O painel de administração fica em `https://SEU-ENDERECO/admin` e pede a senha configurada em `ADMIN_PASSWORD`.

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
- **A lista de faculdades do cadastro está vazia:** isso acontecia em versões antigas do site com `SEED=false`. Na versão atual, a lista é criada sozinha. Depois que a publicação mais recente estiver **Ready**, abra o site e recarregue a página (`Ctrl + Shift + R`). Se ainda estiver vazia, abra `https://SEU-ENDERECO/api/colleges`: deve aparecer uma lista com 12 faculdades. Se aparecer um erro, anote o texto da mensagem e confira os **Logs** do projeto na Vercel.
- **O site abre, mas o cadastro dá erro:** abra **Logs** do projeto na Vercel. Se falar de `DATABASE_URL`, a variável não foi criada ou está com o valor errado. Corrija em **Settings → Environment Variables** e faça **Redeploy** (em **Deployments**, menu de três pontinhos).
- **Página não encontrada em `/admin` ou ao recarregar:** confira se o **Root Directory** é `site` (Passo 2) e se o **Framework Preset** é **Other**.
- **A publicação falha dizendo que o Node é antigo:** em **Settings → General → Node.js Version**, escolha **24.x** e faça **Redeploy**.
- **O painel `/admin` abre sem pedir senha:** a variável `ADMIN_PASSWORD` não foi criada (nesse caso o painel deveria aparecer desativado). Crie e faça **Redeploy**.
- **Variáveis novas não têm efeito:** a Vercel só lê variáveis novas em publicações novas. Sempre faça **Redeploy** depois de mudar.

## Desenvolvimento no seu computador

Rode `pnpm dev` na pasta `site` (site e API sobem juntos em http://localhost:8443) e use um arquivo local (`data/rotau.db`). Para apontar o computador para o banco do Turso, defina `DATABASE_URL` e `DATABASE_AUTH_TOKEN` antes de rodar. Cuidado: assim você mexe nos dados reais.

## Como funcionam os recursos do site

As seções abaixo explicam o comportamento de cada recurso depois de publicado e as variáveis que o controlam.

### Presença ("Vou hoje") e avisos

Todo dia o estudante abre o painel e toca em **Vou hoje** ou **Não vou hoje**. O motorista vê, na hora, quantos vão, quantos não vão e quem ainda não respondeu, e usa os botões **Iniciar ida** e **Iniciar volta**. Ao iniciar, cada aluno que vai recebe um aviso com a previsão de chegada no ponto dele (cada ponto da rota soma uns 8 minutos).

Os avisos aparecem no **sino** do painel (estudante e motorista) e, se a pessoa permitir, também como notificação do navegador **enquanto o site está aberto**. Eles ficam salvos nas tabelas `attendance`, `route_runs` e `notifications` do Turso; elas são criadas sozinhas na primeira visita, sem você fazer nada. Os motoristas já cadastrados ganham o horário de volta como "a combinar" (e as vans de demonstração, 22:40).

**O que ficou de fora:** notificação com o site fechado (Web Push) precisa de chaves e de um serviço que dispare no horário, o que não cabe no plano gratuito da Vercel sem complicar; fica para uma próxima etapa. Os horários de ida e volta, as cidades, o telefone e o endereço de saída podem ser mudados depois em **Meu perfil**, no painel do motorista.

### Uma van por aluno

Cada estudante fica em **uma van só**. Na tela "Vans disponíveis" ele toca no card de qualquer van para ver motorista, rota, cidades, horários de ida e volta, faculdades e vagas. Dentro da van reservada ele confirma **Vou hoje / Não vou hoje** e pode **cancelar a vaga**; nas outras vans aparece **Trocar para esta van**. A regra também vale na API (não dá para burlar). Contas que já tinham mais de uma reserva são arrumadas sozinhas na próxima visita ao site depois da publicação: fica a reserva confirmada (ou a mais recente), as outras são canceladas e o aluno recebe um aviso no sino. O banco também passa a impedir duas reservas ativas do mesmo aluno.

**Excluir a própria conta:** no fim do painel (aluno e motorista) há o link **Excluir minha conta**. Ele pede a senha e apaga a conta, as reservas, as presenças e os avisos; o motorista da van é avisado. Nada muda na Vercel nem no Turso: não há tabela nova.

### Contas de demonstração (para apresentar o projeto)

O RotaU cria sozinho **9 motoristas de demonstração**, cada um com **5 alunos** (45 no total), para a apresentação do projeto. A lista completa, com e-mails e a senha (`rotau1234`), está em [`DEMO_USUARIOS.md`](DEMO_USUARIOS.md).

- **MotoUpx** (`motoupx@rotau.test`) sai da **Avenida Paraná, 4495** (Sorocaba) e já leva o **EstudanteUpx** (`estudanteupx@rotau.test`, Rua José Leite do Canto Júnior, 441 - Jardim Montreal) e mais 4 alunos. Os outros 8 motoristas ("(demo)" no nome) cobrem outras regiões (Centro, zonas Sul, Leste e Oeste, Votorantim, Itu, Porto Feliz e Araçoiaba da Serra).
- Todas as contas **entram com e-mail e senha**. Os e-mails terminam em `@rotau.test` (domínio que não existe de verdade), e ninguém consegue criar conta nova com ele.
- São criadas na primeira visita depois da publicação, e só uma vez (publicar de novo não duplica). Se um aluno de demonstração cancelar a vaga durante a apresentação, ele volta para a van dele na próxima vez que o site iniciar.
- Os alunos fictícios contam como **"Vou hoje"** todo dia. O EstudanteUpx responde sozinho, como um aluno de verdade.
- Os motoristas de demonstração atendem **todas as faculdades** da lista e não precisam de assinatura.

**Limpeza dos motoristas antigos (uma vez só):** na primeira visita depois desta publicação, o site **apaga todos os motoristas que estavam cadastrados** (inclusive as 11 vans de demonstração antigas e os seus alunos fictícios), porque o cadastro agora pede o endereço de saída da van. Os alunos de verdade continuam, sem van, e recebem um aviso no sino para escolher uma van de novo. Os motoristas que se cadastrarem depois disso **não** são apagados. Não há nada para fazer no Turso: a limpeza fica registrada na tabela `data_migrations`.

**Como remover a demonstração:** na Vercel, abra **Settings → Environment Variables**, crie a variável `DEMO_VANS` com o valor `false` e faça **Redeploy**. Na próxima visita ao site, as contas de demonstração (e as reservas feitas nelas) são apagadas. Os motoristas reais não são afetados. Enquanto `DEMO_VANS=false` existir, elas não voltam.

### Como o tempo de busca é calculado

O RotaU **não usa serviço de mapas** (nada para configurar, grátis e sem chave). O cálculo roda no próprio site:

1. Cada endereço vira um ponto no mapa (o dos alunos e o endereço de saída da van, que o motorista informa no cadastro). As contas de demonstração têm coordenadas fixas. Para os endereços de verdade, o site pergunta ao **Nominatim** (OpenStreetMap, grátis e sem chave) a posição do endereço, no cadastro e quando o aluno abre o painel, e guarda o resultado. Se o serviço estiver fora do ar ou devolver um lugar fora da região, usa o bairro ou a cidade achados no texto (ex.: "Campolim", "Itu"). Se nem isso der, o aluno é colocado no meio da área que a van atende. Para desligar a consulta online, crie `GEOCODE=false`.
2. A ordem das paradas é o caminho mais curto (vizinho mais próximo, melhorado pelo método 2-opt). Na ida a van sai da **casa do motorista** (endereço de saída), vai até o aluno 1, do aluno 1 ao aluno 2 e assim por diante, e termina na faculdade; na volta sai da faculdade e deixa o aluno 1, depois o 2, e assim por diante. Motoristas antigos sem endereço de saída saem da primeira cidade da rota.
3. O tempo entre dois pontos vem da distância em linha reta, aumentada em 35% (as ruas não são retas): até 8 km a 30 km/h (cidade) e o que passar disso a 70 km/h (estrada). Cada parada soma 2 minutos.
4. Só entra na conta quem confirmou **"Vou hoje"**. Antes de a van sair, a previsão usa o horário programado da van; depois que o motorista inicia a rota, usa a hora real da saída.

É uma **estimativa**: não vê trânsito nem o endereço exato de quem digitou só uma rua. Se um dia quiserem mais precisão, o próximo passo é trocar a linha reta por um serviço de rotas (ex.: OpenRouteService, que pede uma chave grátis).

**Comparar vans (painel do aluno):** embaixo do painel, cada van mostra a previsão para aquele aluno, já contando os outros alunos dela: **entrada na van** (quando a van chega na casa dele), **chegada na faculdade** e **chegada em casa** na volta. Fica em destaque, e em primeiro, a van com a **chegada mais rápida**: a menor soma do tempo da saída da van até a casa do aluno e do tempo da faculdade até a casa dele.

### Iniciar a rota e os avisos

No topo do painel, o motorista toca em **Iniciar ida** ou **Iniciar volta**. Cada aluno que confirmou "Vou hoje" recebe um aviso no sino com a **previsão de chegada** no ponto dele (ou em casa, na volta), calculada como na seção acima. O quadro **Quem vai na rota** mostra a saída, a ordem das paradas, o tempo e a distância de cada trecho e o horário de cada aluno; tocar no endereço copia o texto (para colar no aplicativo de mapas). O site não abre nenhum mapa: é só o aviso e a previsão.

Ao chegar, o motorista toca em **Cheguei na faculdade · Finalizar** (ou **Finalizar volta**). A presença do dia é zerada e os alunos voltam a ver **Vou hoje / Não vou hoje**, para dizer se voltam com a van. Uma viagem finalizada pode ser iniciada de novo no mesmo dia. Assinatura, documentos, termos e **Meu perfil** ficam no fim do painel, em **Sua conta**.

### Assinatura mensal do motorista

O RotaU ganha dinheiro com uma **assinatura mensal só dos motoristas** (o aluno não paga nada).

- O motorista cria a conta normalmente, mas a van **só aparece para os alunos** (na busca, na lista de vans e para reservar) enquanto a assinatura estiver em dia. Quem já reservou continua na lista dele.
- No painel do motorista há o cartão **Assinatura do motorista**, com o valor, a validade e o botão **Assinar** / **Renovar**. Pagar antes do vencimento soma 30 dias ao que sobrou.
- O motorista recebe avisos no **sino**: quando ainda não assinou, 3 dias antes de vencer e quando venceu (cada aviso uma vez só).
- O valor simbólico é **R$ 29,90 a cada 30 dias**. Mude com `SUBSCRIPTION_PRICE` (reais) e `SUBSCRIPTION_DAYS` (dias) na Vercel.
- Os motoristas de **demonstração nunca vencem** e continuam visíveis.
- **Atenção:** o pagamento ainda é **simulado**: o botão renova sem cobrar nada. Para cobrar de verdade falta ligar um serviço de pagamento (Stripe ou Mercado Pago) no lugar do botão simulado. Quando isso estiver pronto, defina `SUBSCRIPTION_PAYMENT` com outro valor que não seja `simulado` para desligar o botão simulado.
- **Motoristas que já existiam** no banco ficam sem assinatura e somem das buscas até assinarem. Se não quiser isso agora, defina `SUBSCRIPTION=off`.
- Nada para fazer no Turso: as colunas novas (`subscription_until` e `subscription_notice`) são criadas sozinhas na primeira visita.

### Termos e Segurança (PDF)

Na página **/termos** (link "Termos e Segurança" no rodapé) qualquer pessoa lê as regras de convivência, os termos de uso e as políticas de segurança e clica em **Exportar em PDF**. O PDF é gerado pelo próprio site, de graça, sem serviço externo.

- **Motorista:** no painel há um cartão "Termos e Segurança" para aceitar (assinatura digital: nome, e-mail, data e hora de Brasília e um código de verificação) e exportar o PDF com esse aceite. Quem ainda não aceitou recebe um PDF dizendo que o aceite não foi feito. Ao se cadastrar, o aceite já é registrado pela caixinha do formulário.
- **Aluno:** no painel, depois de reservar, aparece o link do PDF com o aceite do motorista da van dele.
- O texto fica em `site/src/server/terms.ts`. Se mudar de forma importante, aumente `TERMS_VERSION`: os motoristas passam a ver "os termos foram atualizados" e precisam aceitar de novo.
- **Importante:** o texto é um modelo para o projeto. Peça a revisão de um advogado antes de usar com clientes de verdade.
- Não precisa configurar nada na Vercel nem no Turso: as colunas novas do aceite são criadas sozinhas.

### Documentos do veículo (CNH e CRLV)

No painel do motorista há o cartão **Documentos do veículo**: ele envia a foto ou o PDF da CNH e do CRLV (JPG, PNG ou PDF, até 2 MB cada) e vê o status "Enviado" ou "Pendente". Pode trocar ou remover quando quiser.

- Os arquivos ficam guardados no banco (Turso), ligados ao motorista, e **só ele consegue baixar**. Nem a página `/admin` nem os alunos recebem os arquivos.
- Os alunos veem apenas o aviso "Documentos enviados (CNH e CRLV)" no cartão da van e na página dela.
- O tipo do arquivo é conferido pelo conteúdo (não só pela extensão) e o servidor não registra o conteúdo em nenhum log. Apagar a conta do motorista apaga os documentos junto.
- Não precisa configurar nada na Vercel nem no Turso: a tabela nova é criada sozinha. O banco do Turso cresce com os arquivos (cada um pode ter até 2 MB), então vale olhar o espaço usado de vez em quando.
