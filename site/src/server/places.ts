// Coordenadas aproximadas dos lugares da região de Sorocaba, usadas para calcular distâncias.
// Não há geocodificação online: o endereço digitado é comparado com esta lista (bairro/cidade).
import type { Point } from "./route.ts";

type Place = { name: string; point: Point; aliases?: string[] };

// Cidades e bairros (o mais específico vence: "Vila Hortência" antes de "Sorocaba")
const places: Place[] = [
  { name: "Sorocaba (Centro)", point: { lat: -23.5015, lng: -47.4526 }, aliases: ["centro"] },
  { name: "Vila Hortência", point: { lat: -23.4975, lng: -47.4405 } },
  { name: "Jd. Faculdade", point: { lat: -23.489, lng: -47.438 }, aliases: ["jardim faculdade"] },
  { name: "Sorocaba (Zona Norte)", point: { lat: -23.459, lng: -47.458 }, aliases: ["zona norte"] },
  { name: "Éden", point: { lat: -23.431, lng: -47.416 }, aliases: ["eden"] },
  { name: "Itavuvu", point: { lat: -23.464, lng: -47.501 } },
  { name: "Sorocaba (Zona Sul)", point: { lat: -23.542, lng: -47.462 }, aliases: ["zona sul"] },
  { name: "Campolim", point: { lat: -23.533, lng: -47.488 } },
  { name: "Jd. Europa", point: { lat: -23.524, lng: -47.474 }, aliases: ["jardim europa"] },
  { name: "Sorocaba (Zona Leste)", point: { lat: -23.488, lng: -47.41 }, aliases: ["zona leste"] },
  { name: "Brigadeiro Tobias", point: { lat: -23.454, lng: -47.388 } },
  { name: "Sorocaba (Zona Oeste)", point: { lat: -23.5, lng: -47.5 }, aliases: ["zona oeste"] },
  { name: "Wanel Ville", point: { lat: -23.479, lng: -47.513 } },
  { name: "Sorocaba", point: { lat: -23.5015, lng: -47.4526 } },
  { name: "Votorantim", point: { lat: -23.5466, lng: -47.4378 } },
  { name: "Salto de Pirapora", point: { lat: -23.6469, lng: -47.5731 } },
  { name: "Piedade", point: { lat: -23.7131, lng: -47.4275 } },
  { name: "Pilar do Sul", point: { lat: -23.8097, lng: -47.7186 } },
  { name: "Itu", point: { lat: -23.264, lng: -47.2993 } },
  { name: "Salto", point: { lat: -23.2, lng: -47.2869 } },
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
  fatec: { lat: -23.492, lng: -47.456 },
  ufscar: { lat: -23.5817, lng: -47.5236 },
  uniso: { lat: -23.4676, lng: -47.4947 },
  unip: { lat: -23.4895, lng: -47.416 },
  unesp: { lat: -23.4937, lng: -47.4753 },
  ifsp: { lat: -23.4856, lng: -47.456 },
  "puc-sp": { lat: -23.4944, lng: -47.4586 },
  anhanguera: { lat: -23.4834, lng: -47.459 },
  esamc: { lat: -23.482, lng: -47.4418 },
  fadi: { lat: -23.4975, lng: -47.4545 },
  ceunsp: { lat: -23.2, lng: -47.29 },
};

// Sem acentos, minúsculas e sem pontuação: "Jd. Européia" ≈ "jd europeia"
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bjd\b\.?/g, "jardim")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const index = places
  .flatMap((place) =>
    [place.name, ...(place.aliases ?? [])].map((alias) => ({ alias: normalize(alias), point: place.point })),
  )
  // nomes maiores primeiro, para "Vila Hortência" ganhar de "Centro"/"Sorocaba"
  .sort((a, b) => b.alias.length - a.alias.length);

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
