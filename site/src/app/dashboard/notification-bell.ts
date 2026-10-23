import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, inject, output, signal } from "@angular/core";
import { ApiService, type Notification } from "../api.service";
import { Icon } from "../shared/icon";

// De quanto em quanto tempo o painel procura avisos novos
export const POLL_MS = 30_000;

// Sino do painel: lista os avisos (presença, rota iniciada, reservas) e, se o
// usuário permitir, mostra também uma notificação do navegador enquanto o site está aberto.
@Component({
  selector: "app-notification-bell",
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "relative" },
  template: `
    <button class="relative grid size-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
      (click)="toggle()" [attr.aria-expanded]="open()" [attr.aria-label]="unread() ? unread() + ' avisos novos' : 'Avisos'">
      <app-icon name="bell" class="size-5" />
      @if (unread()) {
        <span class="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-extrabold leading-5 text-white">{{ unread() > 9 ? "9+" : unread() }}</span>
      }
    </button>
    @if (open()) {
      <div class="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-2xl shadow-blue-900/10">
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <strong class="text-sm text-slate-950">Avisos</strong>
          @if (canAskPermission()) {
            <button class="text-xs font-bold text-blue-600 hover:underline" (click)="askPermission()">Avisar também no navegador</button>
          }
        </div>
        <div class="max-h-96 divide-y divide-slate-100 overflow-y-auto">
          @for (item of items(); track item.id) {
            <article class="px-4 py-3" [class.bg-blue-50]="!item.read">
              <div class="flex items-baseline justify-between gap-3">
                <strong class="text-sm text-slate-950">{{ item.title }}</strong>
                <span class="shrink-0 text-xs text-slate-400">{{ when(item.createdAt) }}</span>
              </div>
              <p class="mt-1 text-sm leading-5 text-slate-600">{{ item.body }}</p>
            </article>
          } @empty {
            <p class="px-4 py-8 text-center text-sm text-slate-500">Nenhum aviso por enquanto.</p>
          }
        </div>
      </div>
    }
  `,
})
export class NotificationBell {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly changed = output();
  readonly items = signal<Notification[]>([]);
  readonly unread = signal(0);
  readonly open = signal(false);
  readonly canAskPermission = signal(false);
  private lastId = 0;

  constructor() {
    afterNextRender(() => {
      this.canAskPermission.set("Notification" in window && Notification.permission === "default");
      this.load(true);
      const timer = setInterval(() => this.load(false), POLL_MS);
      this.destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  private async load(first: boolean) {
    try {
      const list = await this.api.notifications();
      const fresh = list.items.filter((item) => item.id > this.lastId && !item.read);
      this.items.set(list.items);
      this.unread.set(list.unread);
      this.lastId = Math.max(this.lastId, ...list.items.map((item) => item.id));
      if (!first && fresh.length) {
        this.changed.emit();
        this.showInBrowser(fresh);
      }
    } catch {
      // sem conexão: tenta de novo no próximo ciclo
    }
  }

  private showInBrowser(items: Notification[]) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    for (const item of items.slice(0, 3)) new Notification(item.title, { body: item.body, icon: "/favicon.svg", tag: `rotau-${item.id}` });
  }

  async askPermission() {
    await Notification.requestPermission();
    this.canAskPermission.set(Notification.permission === "default");
  }

  async toggle() {
    this.open.update((value) => !value);
    if (this.open() && this.unread()) {
      this.unread.set(0);
      await this.api.markNotificationsRead().catch(() => {});
    }
  }

  when(iso: string) {
    const date = new Date(iso);
    const sameDay = date.toDateString() === new Date().toDateString();
    return sameDay
      ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
}
