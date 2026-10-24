// Localiza um endereço digitado no mapa com o Nominatim (OpenStreetMap), que é grátis e não pede chave.
// É só uma ajuda: se o serviço estiver fora do ar, lento ou devolver um lugar longe da região,
// devolve null e o cálculo usa a aproximação por bairro/cidade (places.ts). GEOCODE=false desliga.
import type { Point } from "./route.ts";

// Região atendida (Sorocaba e cidades vizinhas): resultados fora dela são ignorados
const REGION = { minLat: -24.2, maxLat: -22.8, minLng: -48.4, maxLng: -46.8 };

type Fetcher = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export async function geocode(address: string, fetcher: Fetcher = fetch as Fetcher): Promise<Point | null> {
  if (process.env.GEOCODE === "false" || address.trim().length < 5) return null;
  const params = new URLSearchParams({
    q: `${address}, Brasil`, format: "json", limit: "1", countrycodes: "br",
    viewbox: `${REGION.minLng},${REGION.maxLat},${REGION.maxLng},${REGION.minLat}`,
  });
  try {
    const res = await fetcher(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "RotaU/1.0 (https://rotau.vercel.app)", "Accept-Language": "pt-BR" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const [hit] = (await res.json()) as { lat?: string; lon?: string }[];
    const lat = Number(hit?.lat);
    const lng = Number(hit?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const inside = lat >= REGION.minLat && lat <= REGION.maxLat && lng >= REGION.minLng && lng <= REGION.maxLng;
    return inside ? { lat, lng } : null;
  } catch {
    return null;
  }
}
