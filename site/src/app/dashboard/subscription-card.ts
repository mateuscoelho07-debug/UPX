import { ChangeDetectionStrategy, Component, inject, input, output, signal } from "@angular/core";
import { ApiRequestError, ApiService, type Subscription } from "../api.service";
import { Icon } from "../shared/icon";

// Assinatura mensal do motorista: sem ela a van fica oculta para os alunos.
// O pagamento ainda é simulado (não cobra de verdade).
@Component({
  selector: "app-subscription-card",
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (subscription().enabled) {
      <section
        class="mt-8 flex flex-col gap-4 rounded-3xl border p-6 sm:flex-row sm:items-center sm:justify-between"
        [class]="subscription().active ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50'"
        aria-label="Assinatura do motorista"
      >
        <div>
          <span class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider" [class]="subscription().active ? 'text-emerald-700' : 'text-amber-700'">
            <app-icon name="check" class="size-4" /> Assinatura do motorista
          </span>
          @if (subscription().active) {
            <h2 class="mt-2 text-lg font-extrabold text-slate-950">Assinatura em dia até {{ until() }}</h2>
            <p class="mt-1 text-sm text-slate-600">{{ remaining() }} Sua van aparece para os alunos se candidatarem.</p>
          } @else {
            <h2 class="mt-2 text-lg font-extrabold text-slate-950">{{ subscription().until ? "Sua assinatura venceu em " + until() : "Assine para liberar sua van" }}</h2>
            <p class="mt-1 text-sm text-slate-700">Enquanto a assinatura não estiver em dia, sua van fica <strong>oculta para novos alunos</strong>. Quem já reservou continua na sua lista.</p>
          }
          <p class="mt-2 text-xs text-slate-500">
            {{ price() }} a cada {{ subscription().days }} dias.
            @if (subscription().simulated) { Pagamento simulado: nenhuma cobrança real é feita por enquanto. }
          </p>
          @if (error()) {
            <p class="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{{ error() }}</p>
          }
        </div>
        <button class="btn-primary shrink-0 disabled:opacity-50" [disabled]="saving()" (click)="pay()">
          {{ saving() ? "Processando..." : subscription().active ? "Renovar assinatura" : "Assinar por " + price() }}
        </button>
      </section>
    }
  `,
})
export class SubscriptionCard {
  private readonly api = inject(ApiService);
  readonly driverId = input.required<number>();
  readonly subscription = input.required<Subscription>();
  readonly changed = output();
  readonly unauthorized = output();

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  price() {
    return this.subscription().price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  until() {
    return (this.subscription().until ?? "").split("-").reverse().join("/");
  }

  remaining() {
    const days = this.subscription().daysLeft;
    if (days === null) return "";
    if (days === 0) return "Vence hoje.";
    return `Faltam ${days} ${days === 1 ? "dia" : "dias"}.`;
  }

  async pay() {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.subscribe(this.driverId());
      this.changed.emit();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) this.unauthorized.emit();
      else this.error.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
