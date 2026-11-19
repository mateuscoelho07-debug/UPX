// Componente raiz: só contém o <router-outlet>; cada página é carregada pela rota (app.routes.ts).
import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: "app-root",
  imports: [RouterOutlet],
  template: "<router-outlet />",
})
export class App {}
