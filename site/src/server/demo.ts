// Contas de DEMONSTRAÇÃO do RotaU, usadas para apresentar o projeto: 9 motoristas, cada um com 5 alunos.
// Todas entram com e-mail e a senha DEMO_PASSWORD (lista completa em docs/DEMO_USUARIOS.md).
// - MotoUpx sai da Avenida Paraná, 4495 (Sorocaba) e já leva o EstudanteUpx e mais 4 alunos.
// - Os outros 8 motoristas cobrem outras regiões, para o aluno comparar as vans.
// Os nomes terminados em "(demo)" e os endereços dos alunos fictícios são inventados (parecem reais).
// As coordenadas são fixas para a rota dar sempre o mesmo resultado. Os dois endereços informados
// pelo projeto (MotoUpx e EstudanteUpx) têm `geocode: true`: o servidor tenta localizá-los no mapa
// (OpenStreetMap) ao criar as contas e, se não conseguir, usa a posição aproximada daqui.

// Domínio dos e-mails de demonstração (.test é reservado: nunca existe de verdade)
export const DEMO_DOMAIN = "rotau.test";
// Domínio das vans de demonstração antigas (sem senha), apagadas pela limpeza de 2026-11
export const LEGACY_DEMO_DOMAIN = "demo.rotau.invalid";

// Senha de todas as contas de demonstração
export const DEMO_PASSWORD = "rotau1234";

export type DemoPlace = { address: string; lat: number; lng: number; geocode?: boolean };
export type DemoStudent = DemoPlace & { name: string; email: string };
export type DemoDriver = {
  name: string;
  email: string;
  phone: string;
  vanModel: string;
  plate: string;
  capacity: number;
  departureTime: string;
  returnTime: string;
  rating: number;
  cities: string[];
  start: DemoPlace;
  students: DemoStudent[];
};

// Faculdade de todos os alunos de demonstração (as vans atendem todas as faculdades)
export const DEMO_COLLEGE = "UniFacens";

// Aluno de demonstração: e-mail aluno<motorista>-<n>@rotau.test
function aluno(driver: number, index: number, name: string, address: string, lat: number, lng: number): DemoStudent {
  return { name: `${name} (demo)`, email: `aluno${driver}-${index}@${DEMO_DOMAIN}`, address, lat, lng };
}

export const demoDrivers: DemoDriver[] = [
  {
    name: "MotoUpx",
    email: `motoupx@${DEMO_DOMAIN}`,
    phone: "(15) 90000-0001",
    vanModel: "Renault Master",
    plate: "UPX-1A01",
    capacity: 15,
    departureTime: "17:50",
    returnTime: "22:40",
    rating: 5,
    cities: ["Sorocaba (Zona Norte)", "Sorocaba"],
    start: { address: "Avenida Paraná, 4495 - Sorocaba", lat: -23.4585, lng: -47.479, geocode: true },
    students: [
      {
        name: "EstudanteUpx",
        email: `estudanteupx@${DEMO_DOMAIN}`,
        address: "Rua José Leite do Canto Júnior, 441 - Jardim Montreal, Sorocaba",
        lat: -23.4556,
        lng: -47.4888,
        geocode: true,
      },
      aluno(1, 2, "Aline Dias", "Rua das Acácias, 210 - Zona Norte (Sorocaba)", -23.4621, -47.4842),
      aluno(1, 3, "Bruno Moreira", "Rua dos Ipês, 95 - Itavuvu", -23.4652, -47.4975),
      aluno(1, 4, "Camila Uchoa", "Rua Minas Gerais, 318 - Zona Norte (Sorocaba)", -23.4689, -47.4701),
      aluno(1, 5, "Diego Freitas", "Rua do Comércio, 77 - Zona Norte (Sorocaba)", -23.4733, -47.4598),
    ],
  },
  {
    name: "Paulo Mendes (demo)",
    email: `motorista2@${DEMO_DOMAIN}`,
    phone: "(15) 90000-0002",
    vanModel: "Mercedes Sprinter",
    plate: "DEM-2B02",
    capacity: 15,
    departureTime: "17:40",
    returnTime: "22:40",
    rating: 4.8,
    cities: ["Sorocaba (Centro)", "Vila Hortência"],
    start: { address: "Rua Barão de Piratininga, 500 - Centro (Sorocaba)", lat: -23.5038, lng: -47.4582 },
    students: [
      aluno(2, 1, "Eduarda Nascimento", "Rua das Acácias, 596 - Centro (Sorocaba)", -23.5046, -47.4505),
      aluno(2, 2, "Felipe Vieira", "Rua XV de Novembro, 896 - Vila Hortência", -23.4946, -47.4377),
      aluno(2, 3, "Gabriela Gomes", "Rua Floriano Peixoto, 748 - Centro (Sorocaba)", -23.4977, -47.4552),
      aluno(2, 4, "Henrique Pacheco", "Rua São João, 718 - Vila Hortência", -23.5024, -47.4392),
      aluno(2, 5, "Isabela Xavier", "Rua Tiradentes, 171 - Jd. Faculdade", -23.4829, -47.4347),
    ],
  },
  {
    name: "Juliana Prado (demo)",
    email: `motorista3@${DEMO_DOMAIN}`,
    phone: "(15) 90000-0003",
    vanModel: "Fiat Ducato",
    plate: "DEM-3C03",
    capacity: 14,
    departureTime: "17:35",
    returnTime: "22:40",
    rating: 4.9,
    cities: ["Sorocaba (Zona Sul)", "Campolim", "Jd. Europa"],
    start: { address: "Av. São Paulo, 1200 - Zona Sul (Sorocaba)", lat: -23.5501, lng: -47.4652 },
    students: [
      aluno(3, 1, "João Heitor", "Av. São Paulo, 741 - Zona Sul (Sorocaba)", -23.5472, -47.4675),
      aluno(3, 2, "Karen Queiroz", "Rua Marechal Deodoro, 299 - Campolim", -23.535, -47.4879),
      aluno(3, 3, "Leonardo Almeida", "Av. Dom Pedro I, 876 - Jd. Europa", -23.5245, -47.4699),
      aluno(3, 4, "Marcela Ibrahim", "Rua Sete de Setembro, 218 - Campolim", -23.534, -47.482),
      aluno(3, 5, "Nicolas Rocha", "Rua Santa Rita, 740 - Jd. Europa", -23.5271, -47.4734),
    ],
  },
  {
    name: "Marcos Teixeira (demo)",
    email: `motorista4@${DEMO_DOMAIN}`,
    phone: "(15) 90000-0004",
    vanModel: "Peugeot Boxer",
    plate: "DEM-4D04",
    capacity: 14,
    departureTime: "17:45",
    returnTime: "22:40",
    rating: 4.7,
    cities: ["Sorocaba (Zona Leste)", "Brigadeiro Tobias"],
    start: { address: "Rua Bela Vista, 900 - Brigadeiro Tobias", lat: -23.4572, lng: -47.3812 },
    students: [
      aluno(4, 1, "Otávio Barbosa", "Av. Independência, 764 - Zona Leste (Sorocaba)", -23.4848, -47.4162),
      aluno(4, 2, "Patrícia Junqueira", "Rua Bela Vista, 538 - Brigadeiro Tobias", -23.4605, -47.3849),
      aluno(4, 3, "Rafael Santana", "Rua das Orquídeas, 371 - Zona Leste (Sorocaba)", -23.4848, -47.4139),
      aluno(4, 4, "Sabrina Cardoso", "Rua das Laranjeiras, 356 - Brigadeiro Tobias", -23.4556, -47.3893),
      aluno(4, 5, "Thiago Lopes", "Av. Brasil, 850 - Zona Leste (Sorocaba)", -23.4891, -47.4176),
    ],
  },
  {
    name: "Sandra Oliveira (demo)",
    email: `motorista5@${DEMO_DOMAIN}`,
    phone: "(15) 90000-0005",
    vanModel: "Renault Master",
    plate: "DEM-5E05",
    capacity: 15,
    departureTime: "17:30",
    returnTime: "22:40",
    rating: 4.6,
    cities: ["Sorocaba (Zona Oeste)", "Wanel Ville"],
    start: { address: "Rua São João, 1500 - Wanel Ville", lat: -23.4741, lng: -47.5259 },
    students: [
      aluno(5, 1, "Vanessa Tavares", "Rua das Acácias, 241 - Zona Oeste (Sorocaba)", -23.5059, -47.4973),
      aluno(5, 2, "Wesley Dias", "Rua XV de Novembro, 24 - Wanel Ville", -23.4824, -47.5165),
      aluno(5, 3, "Yasmin Moreira", "Rua Tiradentes, 387 - Wanel Ville", -23.4835, -47.5081),
      aluno(5, 4, "Caio Uchoa", "Rua Floriano Peixoto, 441 - Zona Oeste (Sorocaba)", -23.4994, -47.4944),
      aluno(5, 5, "Larissa Freitas", "Rua São João, 559 - Wanel Ville", -23.4758, -47.5207),
    ],
  },
  {
    name: "Cláudia Ramos (demo)",
    email: `motorista6@${DEMO_DOMAIN}`,
    phone: "(15) 90000-0006",
    vanModel: "Mercedes Sprinter",
    plate: "DEM-6F06",
    capacity: 16,
    departureTime: "17:15",
    returnTime: "22:40",
    rating: 4.9,
    cities: ["Votorantim", "Salto de Pirapora"],
    start: { address: "Rua do Comércio, 1000 - Votorantim", lat: -23.5521, lng: -47.4402 },
    students: [
      aluno(6, 1, "Murilo Nascimento", "Rua do Comércio, 507 - Votorantim", -23.5474, -47.4376),
      aluno(6, 2, "Natália Vieira", "Rua Minas Gerais, 604 - Votorantim", -23.5499, -47.438),
      aluno(6, 3, "Vitor Gomes", "Rua dos Ipês, 859 - Salto de Pirapora", -23.6517, -47.5728),
      aluno(6, 4, "Letícia Pacheco", "Rua das Palmeiras, 120 - Votorantim", -23.5431, -47.4411),
      aluno(6, 5, "Renan Xavier", "Rua dos Jasmins, 88 - Votorantim", -23.5455, -47.4452),
    ],
  },
  {
    name: "André Fonseca (demo)",
    email: `motorista7@${DEMO_DOMAIN}`,
    phone: "(15) 90000-0007",
    vanModel: "Iveco Daily",
    plate: "DEM-7G07",
    capacity: 16,
    departureTime: "16:50",
    returnTime: "22:40",
    rating: 4.7,
    cities: ["Itu", "Salto"],
    start: { address: "Av. São Paulo, 300 - Itu", lat: -23.2655, lng: -47.3001 },
    students: [
      aluno(7, 1, "Bianca Heitor", "Av. São Paulo, 728 - Itu", -23.261, -47.3028),
      aluno(7, 2, "Aline Queiroz", "Rua Marechal Deodoro, 717 - Salto", -23.1921, -47.287),
      aluno(7, 3, "Bruno Almeida", "Av. Dom Pedro I, 187 - Itu", -23.2629, -47.2965),
      aluno(7, 4, "Camila Ibrahim", "Rua Sete de Setembro, 778 - Salto", -23.1988, -47.2838),
      aluno(7, 5, "Diego Rocha", "Rua Santa Rita, 95 - Itu", -23.2571, -47.3059),
    ],
  },
  {
    name: "Beatriz Campos (demo)",
    email: `motorista8@${DEMO_DOMAIN}`,
    phone: "(15) 90000-0008",
    vanModel: "Fiat Ducato",
    plate: "DEM-8H08",
    capacity: 14,
    departureTime: "16:45",
    returnTime: "22:40",
    rating: 4.8,
    cities: ["Porto Feliz", "Boituva"],
    start: { address: "Av. Independência, 50 - Porto Feliz", lat: -23.2131, lng: -47.5222 },
    students: [
      aluno(8, 1, "Eduarda Barbosa", "Av. Independência, 234 - Porto Feliz", -23.2149, -47.519),
      aluno(8, 2, "Felipe Junqueira", "Rua Bela Vista, 292 - Boituva", -23.2795, -47.6828),
      aluno(8, 3, "Gabriela Santana", "Av. Brasil, 747 - Porto Feliz", -23.2095, -47.5159),
      aluno(8, 4, "Henrique Cardoso", "Rua das Orquídeas, 41 - Boituva", -23.2841, -47.6761),
      aluno(8, 5, "Isabela Lopes", "Rua das Laranjeiras, 27 - Porto Feliz", -23.2178, -47.5265),
    ],
  },
  {
    name: "Rogério Lima (demo)",
    email: `motorista9@${DEMO_DOMAIN}`,
    phone: "(15) 90000-0009",
    vanModel: "Renault Master",
    plate: "DEM-9J09",
    capacity: 15,
    departureTime: "16:50",
    returnTime: "22:40",
    rating: 4.7,
    cities: ["Araçoiaba da Serra", "Iperó"],
    start: { address: "Rua Floriano Peixoto, 100 - Araçoiaba da Serra", lat: -23.5061, lng: -47.6155 },
    students: [
      aluno(9, 1, "João Tavares", "Rua Floriano Peixoto, 449 - Araçoiaba da Serra", -23.5028, -47.6111),
      aluno(9, 2, "Karen Dias", "Rua Tiradentes, 589 - Iperó", -23.3489, -47.6841),
      aluno(9, 3, "Leonardo Moreira", "Rua São João, 620 - Araçoiaba da Serra", -23.5079, -47.6202),
      aluno(9, 4, "Marcela Uchoa", "Rua XV de Novembro, 25 - Iperó", -23.3532, -47.6893),
      aluno(9, 5, "Nicolas Freitas", "Rua das Acácias, 540 - Araçoiaba da Serra", -23.501, -47.6088),
    ],
  },
];
