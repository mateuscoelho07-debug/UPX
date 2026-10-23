import { ChangeDetectionStrategy, Component, inject, output, signal } from "@angular/core";
import { ApiService } from "../api.service";

// "Excluir minha conta": pede a senha de novo e apaga a conta e os dados dela
@Component({
  selector: "app-delete-account",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mt-16 border-t border-slate-200 pt-6 text-sm">
      @if (!open()) {
        <button class="font-semibold text-slate-500 underline hover:text-red-700" (click)="open.set(true)">Excluir minha conta</button>
      } @else {
        <form class="max-w-md rounded-2xl border border-red-100 bg-red-50 p-5" (submit)="submit($event)">
          <strong class="block text-red-900">Excluir minha conta</strong>
          <p class="mt-1 text-red-800">Isso apaga sua conta, suas reservas e seus avisos. Não dá para desfazer. Digite sua senha para confirmar.</p>
          <input class="form-control mt-3 !pl-4" type="password" name="password" required autocomplete="current-password" placeholder="Sua senha"
            [value]="password()" (input)="password.set($any($event.target).value)" />
          @if (error()) {
            <p class="mt-3 font-semibold text-red-800" role="alert">{{ error() }}</p>
          }
          <div class="mt-4 flex gap-3">
            <button class="rounded-xl bg-red-600 px-5 py-2.5 font-bold text-white transition hover:bg-red-700 disabled:opacity-60" type="submit" [disabled]="busy()">{{ busy() ? "Excluindo..." : "Excluir para sempre" }}</button>
            <button class="btn-secondary !px-5 !py-2.5 text-sm" type="button" (click)="open.set(false)">Cancelar</button>
          </div>
        </form>
      }
    </section>
  `,
})
export class DeleteAccount {
  private readonly api = inject(ApiService);
  readonly deleted = output();
  readonly open = signal(false);
  readonly password = signal("");
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async submit(event: Event) {
    event.preventDefault();
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.deleteAccount(this.password());
      this.deleted.emit();
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
