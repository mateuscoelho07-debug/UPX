// Termos de segurança e conduta do RotaU: o texto aparece na página /termos e no PDF exportado.
// Ao mudar o texto de forma relevante, aumente TERMS_VERSION: os motoristas precisam aceitar de novo.
import { createHash } from "node:crypto";
import { buildPdf, type PdfBlock } from "./pdf.ts";
import { localDay, localTime } from "./time.ts";

export const TERMS_VERSION = "1.0";
export const TERMS_UPDATED = "30/10/2026";

export type TermsSection = { title: string; paragraphs: string[]; bullets?: string[] };
export type TermsDocument = { version: string; updatedAt: string; intro: string; sections: TermsSection[] };

export const termsDocument: TermsDocument = {
  version: TERMS_VERSION,
  updatedAt: TERMS_UPDATED,
  intro:
    "Este documento reúne as regras de convivência, os termos de uso e as políticas de segurança da plataforma RotaU, que conecta estudantes a motoristas de van na região de Sorocaba. Ao usar o RotaU, estudantes, responsáveis e motoristas declaram que leram e concordam com o que está escrito aqui.",
  sections: [
    {
      title: "1. O que é o RotaU",
      paragraphs: [
        "O RotaU é uma plataforma de apoio que ajuda estudantes a encontrar vans que fazem o trajeto até a faculdade e ajuda motoristas a organizar suas rotas, vagas e avisos. O RotaU não é empresa de transporte, não é dona das vans e não emprega os motoristas: o transporte é prestado diretamente pelo motorista cadastrado.",
        "Cada motorista é responsável pelo seu veículo, pela sua habilitação, pelos seguros e pelas licenças exigidas em lei para o transporte de passageiros.",
      ],
    },
    {
      title: "2. Regras de convivência",
      paragraphs: ["Para que a viagem seja boa para todos, esperamos de estudantes e motoristas:"],
      bullets: [
        "Tratar todas as pessoas com respeito, sem ofensas, discriminação, assédio ou violência de qualquer tipo.",
        "Ser pontual: o estudante deve estar no ponto de embarque no horário combinado, e o motorista deve avisar atrasos.",
        "Avisar pela plataforma quando não for usar a van no dia (botão \"Não vou hoje\"), para que a rota seja ajustada.",
        "Manter o veículo limpo e respeitar o espaço e o sossego dos demais passageiros (volume de som e conversas moderados).",
        "Não consumir bebidas alcoólicas, cigarros ou outras substâncias dentro da van, e nunca embarcar ou dirigir sob efeito delas.",
        "Cuidar dos pertences: cada pessoa é responsável pelos seus objetos.",
      ],
    },
    {
      title: "3. Termos de uso",
      paragraphs: [
        "O cadastro é pessoal. Cada pessoa deve informar dados verdadeiros e manter a senha em segredo, sendo responsável pelo que for feito com a sua conta.",
        "Estudantes escolhem uma van por vez, e a reserva pode ser confirmada ou recusada pelo motorista. A previsão de horário mostrada no RotaU é uma estimativa calculada pelos endereços e pode variar com o trânsito e com imprevistos.",
        "Estudantes menores de 18 anos devem usar o RotaU com o conhecimento e a autorização de um responsável legal, que também pode exportar este documento e acompanhar as informações da van.",
        "Os motoristas pagam uma assinatura mensal para manter a van visível para os estudantes. O estudante não paga nada ao RotaU. Valores e condições do transporte combinados entre estudante e motorista são de responsabilidade dos dois.",
        "O RotaU pode suspender contas que descumpram estes termos, usem dados falsos ou coloquem outras pessoas em risco.",
      ],
    },
    {
      title: "4. Políticas de segurança",
      paragraphs: ["A promessa do RotaU é uma rota segura. Para isso, o motorista se compromete a:"],
      bullets: [
        "Ter Carteira Nacional de Habilitação (CNH) válida na categoria exigida e enviar uma cópia pelo RotaU.",
        "Manter o veículo com o Certificado de Registro e Licenciamento de Veículo (CRLV) em dia e enviar uma cópia pelo RotaU. Os documentos ficam visíveis só para o próprio motorista; os estudantes veem apenas o selo \"documentos enviados\".",
        "Respeitar a lotação do veículo e exigir o uso do cinto de segurança por todos os passageiros.",
        "Respeitar o Código de Trânsito Brasileiro, os limites de velocidade e não usar o celular enquanto dirige.",
        "Fazer a manutenção do veículo e não circular com problemas que coloquem os passageiros em risco.",
        "Seguir a rota combinada e só deixar o estudante no ponto de desembarque informado.",
      ],
    },
    {
      title: "5. Privacidade e proteção de dados (LGPD)",
      paragraphs: [
        "O RotaU trata os dados pessoais de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018). Coletamos apenas o necessário para o serviço: nome, telefone, e-mail, endereço de embarque e faculdade do estudante, e nome, contato, dados da van e documentos do motorista.",
        "O endereço do estudante é usado para calcular a rota e é visto pelo motorista da van escolhida. O telefone do motorista só aparece para o estudante que reservou vaga. Os documentos do motorista (CNH e CRLV) ficam armazenados com acesso restrito ao próprio motorista e não são mostrados a outras pessoas.",
        "Não vendemos dados pessoais. Cada pessoa pode pedir acesso, correção ou exclusão dos seus dados e pode excluir a própria conta no painel (\"Excluir minha conta\"), o que apaga seus dados da plataforma.",
      ],
    },
    {
      title: "6. Responsabilidades e limites",
      paragraphs: [
        "O RotaU se esforça para manter a plataforma disponível e correta, mas não garante funcionamento sem interrupções. Atrasos, cancelamentos, acidentes ou outros fatos ocorridos durante o transporte são de responsabilidade do motorista que prestou o serviço, nos termos da lei.",
        "Em caso de emergência, ligue para os serviços de socorro (SAMU 192, Polícia 190, Bombeiros 193). Para denunciar condutas que descumpram estes termos, entre em contato com a equipe do RotaU pelos canais oficiais do site.",
      ],
    },
    {
      title: "7. Aceite digital do motorista",
      paragraphs: [
        "O motorista registra o aceite destes termos dentro do RotaU, com a conta e a senha dele. O sistema guarda o nome, a data e a hora do aceite e a versão do documento, e gera um código de verificação que aparece no PDF exportado. É um registro eletrônico de ciência das regras da plataforma.",
      ],
    },
  ],
};

export type DriverAcceptance = { name: string; email: string; id: number; version: string | null; acceptedAt: string | null };

// Código curto que identifica o registro de aceite (o mesmo aceite sempre gera o mesmo código)
export function acceptanceCode(driver: { id: number; email: string }, version: string, acceptedAt: string): string {
  const hash = createHash("sha256").update(`${driver.id}|${driver.email.toLowerCase()}|${version}|${acceptedAt}`).digest("hex").slice(0, 16).toUpperCase();
  return hash.match(/.{4}/g)!.join("-");
}

// "2026-10-30 12:14:05" (UTC, como no banco) -> "30/10/2026 às 09:14" em Brasília
export function formatAcceptance(acceptedAt: string): string {
  const date = new Date(acceptedAt.replace(" ", "T") + "Z");
  return `${localDay(date).split("-").reverse().join("/")} às ${localTime(date)}`;
}

// PDF dos termos; com `driver`, inclui o aceite digital dele (ou diz que ainda não aceitou)
export function termsPdf(driver?: DriverAcceptance): Buffer {
  const blocks: PdfBlock[] = [
    { kind: "title", text: "RotaU - Termos de Segurança e Conduta" },
    { kind: "label", text: `Versão ${TERMS_VERSION} - atualizada em ${TERMS_UPDATED}` },
    { kind: "space", size: 6 },
    { kind: "paragraph", text: termsDocument.intro },
  ];
  for (const section of termsDocument.sections) {
    blocks.push({ kind: "heading", text: section.title });
    for (const paragraph of section.paragraphs) blocks.push({ kind: "paragraph", text: paragraph });
    for (const bullet of section.bullets ?? []) blocks.push({ kind: "bullet", text: bullet });
  }
  blocks.push({ kind: "keep", height: 190 }, { kind: "heading", text: "Assinatura digital de aceite do motorista" });
  if (!driver) {
    blocks.push({ kind: "paragraph", text: "Este documento foi exportado sem escolher uma van, por isso não traz o aceite de nenhum motorista. Para exportar com a assinatura digital do motorista, use o botão da sua van na página Termos e Segurança, depois de entrar na sua conta de estudante." });
  } else if (driver.version === TERMS_VERSION && driver.acceptedAt) {
    blocks.push(
      { kind: "label", text: `Motorista: ${driver.name}` },
      { kind: "paragraph", text: `E-mail cadastrado: ${driver.email}` },
      { kind: "paragraph", text: `Aceite registrado em ${formatAcceptance(driver.acceptedAt)} (horário de Brasília), versão ${driver.version} dos termos.` },
      { kind: "label", text: `Código de verificação: ${acceptanceCode(driver, driver.version, driver.acceptedAt)}` },
      { kind: "paragraph", text: "O motorista aceitou digitalmente estes termos dentro do RotaU, autenticado com a conta e a senha dele." },
    );
  } else {
    blocks.push(
      { kind: "label", text: `Motorista: ${driver.name}` },
      { kind: "paragraph", text: driver.acceptedAt
        ? `O motorista aceitou uma versão anterior (${driver.version}) destes termos e ainda não registrou o aceite da versão atual (${TERMS_VERSION}).`
        : "O motorista ainda não registrou o aceite digital destes termos." },
    );
  }
  return buildPdf(blocks, `RotaU - Termos v${TERMS_VERSION}`, "Termos de Segurança e Conduta - RotaU");
}
