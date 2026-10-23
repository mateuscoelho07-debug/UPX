import { ChangeDetectionStrategy, Component, input } from "@angular/core";

export type IconName =
  | "arrow"
  | "bell"
  | "bus"
  | "check"
  | "clock"
  | "close"
  | "location"
  | "lock"
  | "route"
  | "search"
  | "shield"
  | "sparkle"
  | "student"
  | "user"
  | "van";

// Ícones em SVG (traço), herdam a cor do texto. Tamanho e posição vão no class do <app-icon>.
@Component({
  selector: "app-icon",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "inline-block shrink-0" },
  template: `
    <svg class="block size-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @switch (name()) {
        @case ("arrow") { <svg:path d="M5 12h14M13 6l6 6-6 6" /> }
        @case ("bell") { <svg:path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><svg:path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /> }
        @case ("bus") { <svg:rect x="5" y="3" width="14" height="16" rx="3" /><svg:path d="M5 10h14M8 19v2M16 19v2M8.5 15h.01M15.5 15h.01M8 7h8" /> }
        @case ("check") { <svg:path d="m5 12 4 4L19 6" /> }
        @case ("clock") { <svg:circle cx="12" cy="12" r="9" /><svg:path d="M12 7v5l3 2" /> }
        @case ("close") { <svg:path d="m6 6 12 12M18 6 6 18" /> }
        @case ("location") { <svg:path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><svg:circle cx="12" cy="10" r="2.5" /> }
        @case ("lock") { <svg:rect x="5" y="11" width="14" height="10" rx="2" /><svg:path d="M8 11V7a4 4 0 0 1 8 0v4" /> }
        @case ("route") { <svg:circle cx="6" cy="18" r="2" /><svg:circle cx="18" cy="6" r="2" /><svg:path d="M8 18h3a3 3 0 0 0 0-6h2a3 3 0 0 0 3-3V8" /> }
        @case ("search") { <svg:circle cx="11" cy="11" r="7" /><svg:path d="m20 20-4-4" /> }
        @case ("shield") { <svg:path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6l-7-3Z" /><svg:path d="m9 12 2 2 4-4" /> }
        @case ("sparkle") { <svg:path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" /><svg:path d="m18 14 .7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7L18 14Z" /> }
        @case ("student") { <svg:path d="m3 10 9-5 9 5-9 5-9-5Z" /><svg:path d="M7 12.5V17c3 2.4 7 2.4 10 0v-4.5M21 10v6" /> }
        @case ("user") { <svg:circle cx="12" cy="8" r="4" /><svg:path d="M4 21a8 8 0 0 1 16 0" /> }
        @case ("van") { <svg:path d="M3 16V7a2 2 0 0 1 2-2h10l5 5v6" /><svg:path d="M3 13h17M15 5v5h5" /><svg:circle cx="7" cy="17" r="2" /><svg:circle cx="17" cy="17" r="2" /> }
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
}
