import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import { Icon, type IconName } from "./icon";

// Rótulo + ícone à esquerda; o campo (input/select) vem como conteúdo
@Component({
  selector: "app-field",
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
  template: `
    <label class="block">
      <span class="mb-2 block text-sm font-semibold text-slate-700">{{ label() }}</span>
      <span class="relative block">
        <app-icon [name]="icon()" class="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
        <ng-content />
      </span>
    </label>
  `,
})
export class Field {
  readonly label = input.required<string>();
  readonly icon = input.required<IconName>();
}
