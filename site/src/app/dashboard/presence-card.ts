import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";
import type { BookingStatus } from "../api.service";
import { Icon } from "../shared/icon";

// "Você vai hoje?": Vou hoje / Não vou hoje (usado no painel e na página da van)
@Component({
  selector: "app-presence-card",
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    <article class="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-blue-900/5">
      <h2 class="text-xl font-extrabold text-slate-950">Você vai hoje?</h2>
      <p class="mt-1 text-sm text-slate-500">Confirme para o motorista montar a rota do dia.</p>
      <div class="mt-5 grid grid-cols-2 gap-3">
        <button class="rounded-xl border-2 px-4 py-3.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50"
          [class]="going() === true ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-200' : 'border-blue-600 bg-white text-blue-700 hover:bg-blue-50'"
          [attr.aria-pressed]="going() === true" [disabled]="!hasVan() || saving()" (click)="choose.emit(true)">Vou hoje</button>
        <button class="rounded-xl border-2 px-4 py-3.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50"
          [class]="going() === false ? 'border-slate-700 bg-slate-700 text-white' : 'border-blue-600 bg-white text-blue-700 hover:bg-blue-50'"
          [attr.aria-pressed]="going() === false" [disabled]="!hasVan() || saving()" (click)="choose.emit(false)">Não vou hoje</button>
      </div>
      <p class="mt-4 text-sm" role="status" [class]="going() === true ? 'font-semibold text-emerald-700' : 'text-slate-600'">
        @if (!hasVan()) {
          Escolha uma van abaixo para confirmar presença todo dia.
        } @else if (going() === true) {
          <app-icon name="check" class="mr-1 size-4 align-[-3px]" />Presença confirmada: você vai hoje.
        } @else if (going() === false) {
          Você avisou que não vai hoje. O motorista já sabe.
        } @else {
          Você ainda não respondeu hoje.
        }
      </p>
      @if (status() === "Aguardando") {
        <p class="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">Sua reserva ainda aguarda a confirmação do motorista.</p>
      }
      @if (error()) {
        <p class="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{{ error() }}</p>
      }
    </article>
  `,
})
export class PresenceCard {
  readonly going = input<boolean | null>(null);
  readonly hasVan = input(true);
  readonly status = input<BookingStatus | null>(null);
  readonly saving = input(false);
  readonly error = input<string | null>(null);
  readonly choose = output<boolean>();
}
