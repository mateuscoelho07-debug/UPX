// Estudantes FICTÍCIOS de demonstração, distribuídos pelas vans de demonstração (mesmas chaves de
// demoVans em db.ts). Os endereços parecem reais, mas os nomes e as casas são inventados.
// As coordenadas são fixas (aproximadas ao bairro) para o cálculo de rota dar sempre o mesmo resultado.
// [nome, endereço, latitude, longitude, faculdade]
export type DemoStudent = [name: string, address: string, lat: number, lng: number, college: string];

export const demoStudents: Record<string, DemoStudent[]> = {
  centro: [
    ["Aline Dias", "Rua das Acácias, 596 - Centro (Sorocaba)", -23.5046, -47.4505, "Fatec"],
    ["Bruno Moreira", "Rua XV de Novembro, 896 - Vila Hortência", -23.4946, -47.4377, "IFSP"],
    ["Camila Uchoa", "Rua Tiradentes, 171 - Jd. Faculdade", -23.4829, -47.4347, "UniFacens"],
    ["Diego Freitas", "Rua Floriano Peixoto, 748 - Centro (Sorocaba)", -23.4977, -47.4552, "Unesp"],
    ["Eduarda Nascimento", "Rua São João, 718 - Vila Hortência", -23.5024, -47.4392, "Fadi"],
  ],
  norte: [
    ["Felipe Vieira", "Rua do Comércio, 225 - Zona Norte (Sorocaba)", -23.4637, -47.4534, "Unip"],
    ["Gabriela Gomes", "Rua Minas Gerais, 786 - Éden", -23.4255, -47.4222, "ESAMC"],
    ["Henrique Pacheco", "Rua dos Ipês, 433 - Itavuvu", -23.4603, -47.5031, "Uniso"],
    ["Isabela Xavier", "Rua das Palmeiras, 265 - Éden", -23.4331, -47.4093, "Anhanguera"],
    ["João Heitor", "Rua dos Jasmins, 786 - Zona Norte (Sorocaba)", -23.4603, -47.4591, "Ufscar"],
  ],
  sul: [
    ["Karen Queiroz", "Av. São Paulo, 741 - Zona Sul (Sorocaba)", -23.5472, -47.4675, "PUC-SP"],
    ["Leonardo Almeida", "Rua Marechal Deodoro, 299 - Campolim", -23.5350, -47.4879, "Fatec"],
    ["Marcela Ibrahim", "Av. Dom Pedro I, 876 - Jd. Europa", -23.5245, -47.4699, "IFSP"],
    ["Nicolas Rocha", "Rua Sete de Setembro, 218 - Campolim", -23.5340, -47.4820, "UniFacens"],
    ["Otávio Barbosa", "Rua Santa Rita, 740 - Jd. Europa", -23.5271, -47.4734, "Unesp"],
  ],
  leste: [
    ["Patrícia Junqueira", "Av. Independência, 764 - Zona Leste (Sorocaba)", -23.4848, -47.4162, "Fadi"],
    ["Rafael Santana", "Rua Bela Vista, 538 - Brigadeiro Tobias", -23.4605, -47.3849, "Unip"],
    ["Sabrina Cardoso", "Rua das Orquídeas, 371 - Zona Leste (Sorocaba)", -23.4848, -47.4139, "ESAMC"],
    ["Thiago Lopes", "Rua das Laranjeiras, 356 - Brigadeiro Tobias", -23.4556, -47.3893, "Uniso"],
    ["Vanessa Tavares", "Av. Brasil, 850 - Zona Leste (Sorocaba)", -23.4891, -47.4176, "Anhanguera"],
  ],
  oeste: [
    ["Wesley Dias", "Rua das Acácias, 241 - Zona Oeste (Sorocaba)", -23.5059, -47.4973, "Ufscar"],
    ["Yasmin Moreira", "Rua XV de Novembro, 24 - Wanel Ville", -23.4824, -47.5165, "PUC-SP"],
    ["Caio Uchoa", "Rua Tiradentes, 387 - Wanel Ville", -23.4835, -47.5081, "Fatec"],
    ["Larissa Freitas", "Rua Floriano Peixoto, 441 - Zona Oeste (Sorocaba)", -23.4994, -47.4944, "IFSP"],
    ["Murilo Nascimento", "Rua São João, 559 - Wanel Ville", -23.4758, -47.5207, "UniFacens"],
  ],
  votorantim: [
    ["Natália Vieira", "Rua do Comércio, 507 - Votorantim", -23.5474, -47.4376, "Unesp"],
    ["Vitor Gomes", "Rua Minas Gerais, 604 - Votorantim", -23.5499, -47.4380, "Fadi"],
    ["Letícia Pacheco", "Rua dos Ipês, 859 - Salto de Pirapora", -23.6517, -47.5728, "Unip"],
    ["Renan Xavier", "Rua das Palmeiras, 817 - Piedade", -23.7113, -47.4353, "ESAMC"],
    ["Bianca Heitor", "Rua dos Jasmins, 583 - Pilar do Sul", -23.8073, -47.7202, "Uniso"],
  ],
  itu: [
    ["Aline Queiroz", "Av. São Paulo, 728 - Itu", -23.2610, -47.3028, "Anhanguera"],
    ["Bruno Almeida", "Rua Marechal Deodoro, 717 - Salto", -23.1921, -47.2870, "ESAMC"],
    ["Camila Ibrahim", "Av. Dom Pedro I, 187 - Itu", -23.2629, -47.2965, "Fadi"],
    ["Diego Rocha", "Rua Sete de Setembro, 778 - Salto", -23.1988, -47.2838, "UniFacens"],
    ["Eduarda Barbosa", "Rua Santa Rita, 95 - Itu", -23.2571, -47.3059, "Fatec"],
  ],
  portofeliz: [
    ["Felipe Junqueira", "Av. Independência, 234 - Porto Feliz", -23.2149, -47.5190, "UniFacens"],
    ["Gabriela Santana", "Rua Bela Vista, 292 - Boituva", -23.2795, -47.6828, "Unesp"],
    ["Henrique Cardoso", "Rua das Orquídeas, 728 - Cerquilho", -23.1679, -47.7467, "Fadi"],
    ["Isabela Lopes", "Rua das Laranjeiras, 27 - Tietê", -23.1129, -47.7134, "Unip"],
    ["João Tavares", "Av. Brasil, 747 - Porto Feliz", -23.2095, -47.5159, "ESAMC"],
  ],
  tatui: [
    ["Karen Dias", "Rua das Acácias, 540 - Tatuí", -23.3498, -47.8595, "Uniso"],
    ["Leonardo Moreira", "Rua XV de Novembro, 25 - Capela do Alto", -23.4678, -47.7334, "Anhanguera"],
    ["Marcela Uchoa", "Rua Tiradentes, 589 - Iperó", -23.3489, -47.6841, "Ufscar"],
    ["Nicolas Freitas", "Rua Floriano Peixoto, 449 - Araçoiaba da Serra", -23.5028, -47.6111, "PUC-SP"],
    ["Otávio Nascimento", "Rua São João, 620 - Tatuí", -23.3615, -47.8553, "Fatec"],
  ],
  itapetininga: [
    ["Patrícia Vieira", "Rua do Comércio, 207 - Itapetininga", -23.5889, -48.0540, "IFSP"],
    ["Rafael Gomes", "Rua Minas Gerais, 302 - Alambari", -23.5487, -47.9023, "UniFacens"],
    ["Sabrina Pacheco", "Rua dos Ipês, 351 - Sarapuí", -23.6430, -47.8288, "Unesp"],
    ["Thiago Xavier", "Rua das Palmeiras, 124 - Itapetininga", -23.5910, -48.0456, "Fadi"],
    ["Vanessa Heitor", "Rua dos Jasmins, 636 - Alambari", -23.5514, -47.8948, "Unip"],
  ],
  saoroque: [
    ["Wesley Queiroz", "Av. São Paulo, 724 - São Roque", -23.5321, -47.1379, "IFSP"],
    ["Yasmin Almeida", "Rua Marechal Deodoro, 441 - Mairinque", -23.5469, -47.1782, "PUC-SP"],
    ["Caio Ibrahim", "Av. Dom Pedro I, 323 - Alumínio", -23.5398, -47.2547, "Anhanguera"],
    ["Larissa Rocha", "Rua Sete de Setembro, 363 - São Roque", -23.5357, -47.1434, "ESAMC"],
    ["Murilo Barbosa", "Rua Santa Rita, 127 - Mairinque", -23.5471, -47.1801, "Fadi"],
  ],

};
