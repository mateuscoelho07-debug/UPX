// Links de rota do Google Maps ("Directions URL", api=1): grátis, sem chave, e abrem no app do celular.
// O link aceita no máximo 9 paradas intermediárias; passando disso a rota é dividida em trechos.
export const MAX_WAYPOINTS = 9;

export type MapsLink = { label: string; url: string };

const BASE = "https://www.google.com/maps/dir/?api=1&travelmode=driving";

function link(origin: string | null, waypoints: string[], destination: string): string {
  const params = new URLSearchParams();
  if (origin) params.set("origin", origin);
  params.set("destination", destination);
  if (waypoints.length > 0) params.set("waypoints", waypoints.join("|"));
  return `${BASE}&${params}`;
}

// `stops` na ordem da rota (coordenadas "lat,lng" ou endereço em texto).
// Sem `origin`, o Maps parte da posição atual do motorista. Sem `destination`, a rota termina na última parada.
export function mapsLinks(stops: string[], { origin = null, destination = null }: { origin?: string | null; destination?: string | null } = {}): MapsLink[] {
  const points = [...stops, ...(destination ? [destination] : [])];
  if (points.length === 0) return [];
  const size = MAX_WAYPOINTS + 1; // 9 paradas + o ponto de chegada do trecho
  const chunks: string[][] = [];
  for (let i = 0; i < points.length; i += size) chunks.push(points.slice(i, i + size));
  return chunks.map((chunk, index) => {
    const from = index === 0 ? origin : chunks[index - 1]!.at(-1)!;
    return {
      label: chunks.length === 1 ? "Abrir no Google Maps" : `Trecho ${index + 1} de ${chunks.length} no Google Maps`,
      url: link(from, chunk.slice(0, -1), chunk.at(-1)!),
    };
  });
}
