// Coordenadas aproximadas dos lugares da região de Sorocaba, usadas para calcular distâncias.
// Não há geocodificação online: o endereço digitado é comparado com esta lista (bairro/cidade).
import type { Point } from "./route.ts";

type Place = { name: string; point: Point; aliases?: string[] };

// Cidades e bairros (o mais específico vence: "Vila Hortência" antes de "Sorocaba")
const places: Place[] = [
  { name: "Sorocaba (Centro)", point: { lat: -23.5015, lng: -47.4526 }, aliases: ["centro"] },
  { name: "Vila Hortência", point: { lat: -23.4975, lng: -47.4405 } },
  { name: "Jd. Faculdade", point: { lat: -23.4890, lng: -47.4380 }, aliases: ["jardim faculdade"] },
  { name: "Sorocaba (Zona Norte)", point: { lat: -23.4590, lng: -47.4580 }, aliases: ["zona norte"] },
  { name: "Éden", point: { lat: -23.4310, lng: -47.4160 }, aliases: ["eden"] },
  { name: "Itavuvu", point: { lat: -23.4640, lng: -47.5010 } },
  { name: "Sorocaba (Zona Sul)", point: { lat: -23.5420, lng: -47.4620 }, aliases: ["zona sul"] },
  { name: "Campolim", point: { lat: -23.5330, lng: -47.4880 } },
  { name: "Jd. Europa", point: { lat: -23.5240, lng: -47.4740 }, aliases: ["jardim europa"] },
  { name: "Sorocaba (Zona Leste)", point: { lat: -23.4880, lng: -47.4100 }, aliases: ["zona leste"] },
  { name: "Brigadeiro Tobias", point: { lat: -23.4540, lng: -47.3880 } },
  { name: "Sorocaba (Zona Oeste)", point: { lat: -23.5000, lng: -47.5000 }, aliases: ["zona oeste"] },
  { name: "Wanel Ville", point: { lat: -23.4790, lng: -47.5130 } },
  { name: "Sorocaba", point: { lat: -23.5015, lng: -47.4526 } },
  { name: "Votorantim", point: { lat: -23.5466, lng: -47.4378 } },
  { name: "Salto de Pirapora", point: { lat: -23.6469, lng: -47.5731 } },
  { name: "Piedade", point: { lat: -23.7131, lng: -47.4275 } },
  { name: "Pilar do Sul", point: { lat: -23.8097, lng: -47.7186 } },
  { name: "Itu", point: { lat: -23.2640, lng: -47.2993 } },
  { name: "Salto", point: { lat: -23.2000, lng: -47.2869 } },
  { name: "Porto Feliz", point: { lat: -23.2142, lng: -47.5239 } },
  { name: "Boituva", point: { lat: -23.2853, lng: -47.6786 } },
  { name: "Cerquilho", point: { lat: -23.1664, lng: -47.7456 } },
  { name: "Tietê", point: { lat: -23.1101, lng: -47.7167 }, aliases: ["tiete"] },
  { name: "Tatuí", point: { lat: -23.3556, lng: -47.8564 }, aliases: ["tatui"] },
  { name: "Capela do Alto", point: { lat: -23.4639, lng: -47.7339 } },
  { name: "Iperó", point: { lat: -23.3519, lng: -47.6869 }, aliases: ["ipero"] },
  { name: "Araçoiaba da Serra", point: { lat: -23.5053, lng: -47.6178 }, aliases: ["aracoiaba da serra"] },
  { name: "Itapetininga", point: { lat: -23.5917, lng: -48.0531 } },
  { name: "Alambari", point: { lat: -23.5517, lng: -47.9 } },
  { name: "Sarapuí", point: { lat: -23.6389, lng: -47.8261 }, aliases: ["sarapui"] },
  { name: "São Roque", point: { lat: -23.5292, lng: -47.1375 }, aliases: ["sao roque"] },
  { name: "Mairinque", point: { lat: -23.5411, lng: -47.1844 } },
  { name: "Alumínio", point: { lat: -23.5319, lng: -47.2564 }, aliases: ["aluminio"] },
];

// Campus aproximado de cada faculdade (para onde a van vai na ida e de onde sai na volta)
const colleges: Record<string, Point> = {
  unifacens: { lat: -23.4844, lng: -47.4286 },
  fatec: { lat: -23.4920, lng: -47.4560 },
  ufscar: { lat: -23.5817, lng: -47.5236 },
  uniso: { lat: -23.4676, lng: -47.4947 },
  unip: { lat: -23.4895, lng: -47.4160 },
  unesp: { lat: -23.4937, lng: -47.4753 },
  ifsp: { lat: -23.4856, lng: -47.4560 },
  "puc-sp": { lat: -23.4944, lng: -47.4586 },
  anhanguera: { lat: -23.4834, lng: -47.4590 },
  esamc: { lat: -23.4820, lng: -47.4418 },
  fadi: { lat: -23.4975, lng: -47.4545 },
  ceunsp: { lat: -23.2000, lng: -47.2900 },
};

// Sem acentos, minúsculas e sem pontuação: "Jd. Européia" ≈ "jd europeia"
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\bjd\b\.?/g, "jardim").replace(/[^a-z0-9]+/g, " ").trim();
}

const index = places
  .flatMap((place) => [place.name, ...(place.aliases ?? [])].map((alias) => ({ alias: normalize(alias), point: place.point })))
  // nomes maiores primeiro, para "Vila Hortência" ganhar de "Centro"/"Sorocaba"
  .sort((a, b) => b.alias.length - a.alias.length);

// Texto para o Google Maps achar o campus (o mapa conhece a faculdade melhor que nossa coordenada aproximada)
export function collegeSearch(name: string): string {
  return `${name} ${normalize(name) === "ceunsp" ? "Salto SP" : "Sorocaba SP"}`;
}

export function collegePoint(name: string): Point | null {
  return colleges[normalize(name).replace(/ /g, "-")] ?? colleges[normalize(name)] ?? null;
}

export function placePoint(name: string): Point | null {
  const text = ` ${normalize(name)} `;
  return index.find(({ alias }) => text.includes(` ${alias} `))?.point ?? null;
}

// Endereço digitado -> ponto aproximado. Usa o bairro/cidade encontrado no texto e afasta o ponto
// até ~700 m conforme a rua e o número (assim duas casas no mesmo bairro não ficam no mesmo lugar).
export function approximatePoint(address: string): Point | null {
  const base = placePoint(address);
  if (!base) return null;
  const hash = [...normalize(address)].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 7);
  const dLat = ((hash % 1000) / 1000 - 0.5) * 0.012;
  const dLng = (((hash >>> 10) % 1000) / 1000 - 0.5) * 0.012;
  return { lat: base.lat + dLat, lng: base.lng + dLng };
}
