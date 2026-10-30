import { ChangeDetectionStrategy, Component, inject, input, output, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { ApiRequestError, ApiService, type DriverTerms } from "../api.service";

// Termos de segurança e conduta: o motorista aceita (assinatura digital) e exporta o PDF com o aceite
@Component({
  selector: "app-terms-card",
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mt-8 rounded-3xl border p-6" [class]="terms().accepted ? 'border-slate-200 bg-white' : 'border-amber-300 bg-amber-50'" aria-label="Termos de segurança e conduta">
      <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Termos e Segurança</span>
      @if (terms().accepted) {
        <h2 class="mt-2 text-lg font-extrabold text-slate-950">Termos aceitos em {{ acceptedAt() }}</h2>
        <p class="mt-1 text-sm text-slate-600">Versão {{ terms().version }}. Exporte o PDF com as regras e a sua assinatura digital.</p>
      } @else {
        <h2 class="mt-2 text-lg font-extrabold text-slate-950">{{ terms().acceptedVersion ? "Os termos foram atualizados" : "Aceite os termos de segurança e conduta" }}</h2>
        <p class="mt-1 text-sm text-slate-700">Leia as <a class="font-semibold text-blue-700 underline" routerLink="/termos">regras de convivência, termos de uso e políticas de segurança</a> e confirme o aceite.</p>
      }
      @if (error()) {
        <p class="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{{ error() }}</p>
      }
      <div class="mt-4 flex flex-wrap gap-3">
        @if (!terms().accepted) {
          <button class="btn-primary disabled:opacity-50" [disabled]="saving()" (click)="accept()">{{ saving() ? "Salvando..." : "Li e aceito os termos" }}</button>
        }
        <a class="btn-secondary" [href]="'/api/terms.pdf?driverId=' + driverId()" download="termos-rotau.pdf">Exportar PDF</a>
      </div>
    </section>
  `,
})
export class TermsCard {
  private readonly api = inject(ApiService);
  readonly driverId = input.required<number>();
  readonly terms = input.required<DriverTerms>();
  readonly changed = output();
  readonly unauthorized = output();

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  acceptedAt() {
    // "2026-10-30 12:14:05" (UTC) -> dd/mm/aaaa, horário de Brasília
    const raw = this.terms().acceptedAt;
    if (!raw) return "";
    const date = new Date(raw.replace(" ", "T") + "Z");
    return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).replace(",", " às");
  }

  async accept() {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.acceptTerms(this.driverId());
      this.changed.emit();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) this.unauthorized.emit();
      else this.error.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
