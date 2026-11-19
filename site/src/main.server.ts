// Ponto de entrada do Angular no servidor (SSR e geração da página inicial no build).
import { BootstrapContext, bootstrapApplication } from "@angular/platform-browser";
import { App } from "./app/app";
import { config } from "./app/app.config.server";

const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context);

export default bootstrap;
