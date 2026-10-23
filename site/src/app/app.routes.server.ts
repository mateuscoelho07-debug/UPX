import { RenderMode, ServerRoute } from "@angular/ssr";

// A página inicial é gerada no build (abre rápido e aparece no Google).
// Painéis e /admin dependem do login, então são montados no navegador.
export const serverRoutes: ServerRoute[] = [
  { path: "", renderMode: RenderMode.Prerender },
  { path: "**", renderMode: RenderMode.Client },
];
