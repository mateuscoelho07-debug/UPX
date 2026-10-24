// Cálculo da rota da van: ordem das paradas e tempo para buscar (ou deixar) cada estudante.
// Sem serviço de mapas: distância em linha reta (haversine) corrigida por um fator de ruas e
// uma velocidade média (cidade e estrada). Simples, grátis e funciona na Vercel.
export type Point = { lat: number; lng: number };

export const AVERAGE_SPEED_KMH = 30; // velocidade média da van na cidade
export const HIGHWAY_SPEED_KMH = 70; // velocidade média na estrada, para o que passa de CITY_KM por trecho
export const CITY_KM = 8; // até aqui o trecho é percorrido na velocidade da cidade
export const ROAD_FACTOR = 1.35; // ruas são mais longas que a linha reta
export const STOP_MINUTES = 2; // tempo parado em cada embarque
export const UNKNOWN_LEG_MINUTES = 6; // trecho com endereço que não conseguimos localizar

export type Stop = { id: number; point: Point | null };
export type PlannedStop = { id: number; order: number; minutes: number };
export type RoutePlan = { stops: PlannedStop[]; totalMinutes: number; distanceKm: number };

export function haversineKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Quilômetros de ruas entre dois pontos
export function roadKm(a: Point, b: Point): number {
  return haversineKm(a, b) * ROAD_FACTOR;
}

// Os primeiros CITY_KM do trecho andam na velocidade da cidade e o resto (viagem entre cidades) na da estrada
export function travelMinutes(a: Point, b: Point): number {
  const km = roadKm(a, b);
  return (Math.min(km, CITY_KM) / AVERAGE_SPEED_KMH + Math.max(km - CITY_KM, 0) / HIGHWAY_SPEED_KMH) * 60;
}

function pathKm(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += roadKm(points[i - 1]!, points[i]!);
  return total;
}

// Melhor ordem simples: vizinho mais próximo a partir da origem, depois 2-opt (desfaz cruzamentos).
// `end` é o destino fixo (a faculdade na ida); sem ele o caminho termina no último estudante (volta).
function orderPoints(origin: Point, stops: { id: number; point: Point }[], end: Point | null) {
  const remaining = [...stops];
  const order: typeof stops = [];
  let current = origin;
  while (remaining.length > 0) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (roadKm(current, remaining[i]!.point) < roadKm(current, remaining[best]!.point)) best = i;
    }
    const [next] = remaining.splice(best, 1);
    order.push(next!);
    current = next!.point;
  }
  const cost = (list: typeof stops) => pathKm([origin, ...list.map((s) => s.point), ...(end ? [end] : [])]);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
        if (cost(candidate) < cost(order) - 1e-9) {
          order.splice(0, order.length, ...candidate);
          improved = true;
        }
      }
    }
  }
  return order;
}

// Planeja a rota: sai de `origin`, passa por todas as paradas e, se houver, termina em `end`.
// `minutes` de cada parada = tempo desde a saída da van até chegar nela (inclui as paradas anteriores).
export function planRoute(origin: Point | null, stops: Stop[], end: Point | null = null): RoutePlan {
  const located = stops.filter((s): s is { id: number; point: Point } => s.point !== null);
  const unknown = stops.filter((s) => s.point === null);
  const ordered: Stop[] = origin ? orderPoints(origin, located, end) : located;
  const sequence = [...ordered, ...unknown];

  const planned: PlannedStop[] = [];
  let minutes = 0;
  let km = 0;
  let previous: Point | null = origin;
  for (const [index, stop] of sequence.entries()) {
    if (previous && stop.point) {
      minutes += travelMinutes(previous, stop.point);
      km += roadKm(previous, stop.point);
    } else {
      minutes += UNKNOWN_LEG_MINUTES;
    }
    planned.push({ id: stop.id, order: index + 1, minutes: Math.round(minutes) });
    minutes += STOP_MINUTES;
    previous = stop.point ?? previous;
  }
  if (end && previous) {
    minutes += travelMinutes(previous, end);
    km += roadKm(previous, end);
  }
  return { stops: planned, totalMinutes: Math.round(minutes), distanceKm: Math.round(km * 10) / 10 };
}
