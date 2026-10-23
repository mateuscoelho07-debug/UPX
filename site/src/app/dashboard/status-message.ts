import { ChangeDetectionStrategy, Component, input, output } from "@angular/core";

@Component({
  selector: "app-status-message",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <p class="mt-8 text-slate-500">Carregando...</p>
    } @else if (error()) {
      <div class="mt-8 rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-800">
        <strong class="block">Não foi possível carregar os dados.</strong>
        <span>{{ error() }}</span>
        <button class="ml-3 font-bold underline" (click)="retry.emit()">Tentar de novo</button>
      </div>
    }
  `,
})
export class StatusMessage {
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly retry = output();
}
