import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from "@angular/core";
import { Icon } from "./icon";

// Texto com botão de copiar (ex.: endereço do passageiro, para colar no app de mapas).
// Clicar no texto ou no ícone copia; aparece "Copiado!" por 2 segundos.
@Component({
  selector: "app-copy-text",
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "inline-flex min-w-0 max-w-full" },
  template: `
    <button
      type="button"
      class="group inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg text-left transition hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600"
      [attr.aria-label]="(label() || 'Copiar') + ': ' + text()"
      [title]="copied() ? 'Copiado!' : 'Clique para copiar'"
      (click)="copy($event)"
    >
      <span class="min-w-0 truncate">{{ text() }}</span>
      @if (copied()) {
        <span
          class="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700"
          role="status"
          >Copiado!</span
        >
      } @else {
        <app-icon name="copy" class="size-4 text-slate-400 group-hover:text-blue-600" />
      }
    </button>
  `,
})
export class CopyText {
  readonly text = input.required<string>();
  readonly label = input("");
  readonly copied = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  async copy(event: Event) {
    event.stopPropagation();
    const value = this.text();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // navegador sem a API de área de transferência (ou sem HTTPS): usa o jeito antigo
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    this.copied.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.copied.set(false), 2000);
  }
}
