import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { ApiService, type Session } from "../api.service";
import { DriverDashboard } from "./driver-dashboard";
import { StudentDashboard } from "./student-dashboard";

// /painel: mostra o painel do estudante ou do motorista logado
@Component({
  selector: "app-dashboard-page",
  imports: [DriverDashboard, StudentDashboard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (session()?.profile) {
      @case ("student") { <app-student-dashboard [studentId]="session()!.id" (logout)="logout()" /> }
      @case ("driver") { <app-driver-dashboard [driverId]="session()!.id" (logout)="logout()" /> }
      @default { <p class="p-10 text-slate-500">Carregando...</p> }
    }
  `,
})
export default class DashboardPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  readonly session = signal<Session | null>(null);

  constructor() {
    this.api.me().then(
      (me) => {
        if (me.profile === "admin") this.router.navigate(["/"]);
        else this.session.set(me);
      },
      () => this.router.navigate(["/"]),
    );
  }

  // Sessão expirada ou "Sair": volta para o início deslogado
  logout() {
    this.api.logout().catch(() => {});
    this.session.set(null);
    this.router.navigate(["/"]);
  }
}
