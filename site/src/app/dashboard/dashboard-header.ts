import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import { RouterLink } from "@angular/router";
import { Logo } from "../shared/logo";
import { NotificationBell } from "./notification-bell";

@Component({
  selector: "app-dashboard-header",
  imports: [Logo, NotificationBell, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <app-logo />
        <div class="flex items-center gap-3">
          <span class="hidden rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 sm:inline">
            {{ profile() === "driver" ? "Perfil motorista" : "Perfil estudante" }}
          </span>
          <app-notification-bell (changed)="notified.emit()" />
          <a class="btn-secondary !px-4 !py-2.5 text-sm" routerLink="/">Voltar ao início</a>
          <button class="text-sm font-semibold text-slate-500 hover:text-slate-800" (click)="logout.emit()">Sair</button>
        </div>
      </div>
    </header>
  `,
})
export class DashboardHeader {
  readonly profile = input.required<"student" | "driver">();
  readonly logout = output();
  // Chegou aviso novo: o painel recarrega os dados
  readonly notified = output();
}
