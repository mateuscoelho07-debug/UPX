import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { ApiService, type TermsDocument } from "../api.service";
import { Icon } from "../shared/icon";

// "Termos e Segurança": regras de convivência, termos de uso e políticas de segurança, com exportação em PDF
@Component({
  selector: "app-terms-page",
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto max-w-3xl px-5 py-10 lg:px-8">
      <a class="text-sm font-semibold text-blue-700 hover:underline" routerLink="/">← Voltar ao início</a>
      <h1 class="mt-4 text-3xl font-extrabold text-slate-950">Termos e Segurança</h1>
      @if (doc(); as d) {
        <p class="mt-2 text-sm text-slate-500">Versão {{ d.version }} · atualizado em {{ d.updatedAt }}</p>
        <a class="btn-primary mt-5 inline-flex items-center gap-2" href="/api/terms.pdf" download="termos-rotau.pdf">
          <app-icon name="arrow" class="size-5" /> Exportar em PDF
        </a>
        <p class="mt-6 leading-7 text-slate-700">{{ d.intro }}</p>
        @for (section of d.sections; track section.title) {
          <section class="mt-8">
            <h2 class="text-xl font-extrabold text-slate-950">{{ section.title }}</h2>
            @for (paragraph of section.paragraphs; track paragraph) {
              <p class="mt-3 leading-7 text-slate-700">{{ paragraph }}</p>
            }
            @if (section.bullets) {
              <ul class="mt-3 list-disc space-y-1 pl-6 leading-7 text-slate-700">
                @for (bullet of section.bullets; track bullet) { <li>{{ bullet }}</li> }
              </ul>
            }
          </section>
        }
        <p class="mt-10 text-sm text-slate-500">Motoristas: o PDF com a sua assinatura digital de aceite é exportado no seu painel.</p>
      } @else if (failed()) {
        <p class="mt-6 rounded-xl bg-red-50 p-4 text-red-800">Não foi possível carregar os termos agora. Tente de novo em instantes.</p>
      } @else {
        <p class="mt-6 text-slate-500">Carregando...</p>
      }
    </main>
  `,
})
export default class TermsPage {
  private readonly api = inject(ApiService);
  readonly doc = signal<TermsDocument | null>(null);
  readonly failed = signal(false);

  constructor() {
    this.api.terms().then((doc) => this.doc.set(doc), () => this.failed.set(true));
  }
}
