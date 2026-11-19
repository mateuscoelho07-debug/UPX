// Configuração extra usada só no servidor: liga a renderização SSR às regras de app.routes.server.ts.
import { mergeApplicationConfig, ApplicationConfig } from "@angular/core";
import { provideServerRendering, withRoutes } from "@angular/ssr";
import { appConfig } from "./app.config";
import { serverRoutes } from "./app.routes.server";

const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(withRoutes(serverRoutes))],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
