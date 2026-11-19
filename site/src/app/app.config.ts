// Configuração do app Angular no navegador: rotas, HttpClient (fetch) e hidratação do SSR.
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from "@angular/core";
import { provideHttpClient, withFetch } from "@angular/common/http";
import { provideClientHydration } from "@angular/platform-browser";
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from "@angular/router";
import { routes } from "./app.routes";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: "top", anchorScrolling: "enabled" }),
      withComponentInputBinding(),
    ),
    provideHttpClient(withFetch()),
    provideClientHydration(),
  ],
};
