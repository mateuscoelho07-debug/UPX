import { ChangeDetectionStrategy, Component } from "@angular/core";

@Component({
  selector: "app-logo",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-2.5">
      <img class="h-11 w-16 rounded-xl object-cover shadow-lg shadow-blue-200" src="/rotau-logo.png" alt="" />
      <span class="text-xl font-extrabold tracking-tight text-slate-950">Rota<span class="text-blue-600">U</span></span>
      <ng-content />
    </div>
  `,
})
export class Logo {}
