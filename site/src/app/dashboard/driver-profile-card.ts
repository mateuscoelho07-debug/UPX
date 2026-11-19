import { ChangeDetectionStrategy, Component, inject, input, output, signal } from "@angular/core";
import { ApiRequestError, ApiService, type Driver, type DriverProfileUpdate } from "../api.service";

// "Meu perfil" do motorista: mostra o cadastro (e-mail, dados pessoais e da van) e deixa alterar
// telefone, van, horários, cidades e o endereço de saída da van. Nome, e-mail e placa ficam como no cadastro.
@Component({
  selector: "app-driver-profile-card",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      id="perfil"
      class="mt-8 scroll-mt-6 rounded-3xl border border-slate-200 bg-white p-6"
      aria-label="Meu perfil"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Meu perfil</span>
          <h2 class="mt-2 text-lg font-extrabold text-slate-950">{{ driver().name }}</h2>
          <p class="text-sm text-slate-600">{{ driver().email }}</p>
        </div>
        @if (!editing()) {
          <button class="btn-secondary !px-4 !py-2 text-sm" type="button" (click)="edit()">Editar dados</button>
        }
      </div>

      @if (saved()) {
        <p class="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" role="status">
          Dados atualizados.
        </p>
      }

      @if (!editing()) {
        <dl class="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div class="sm:col-span-2 lg:col-span-3">
            <dt class="font-semibold text-slate-500">Endereço de saída da van (sua casa)</dt>
            <dd class="mt-0.5 text-slate-950">
              {{ driver().startAddress || "Não informado: edite para a rota da ida sair de casa" }}
            </dd>
          </div>
          <div>
            <dt class="font-semibold text-slate-500">Celular</dt>
            <dd class="mt-0.5 text-slate-950">{{ driver().phone }}</dd>
          </div>
          <div>
            <dt class="font-semibold text-slate-500">Van</dt>
            <dd class="mt-0.5 text-slate-950">
              {{ driver().vanModel }} · placa {{ driver().plate }} · {{ driver().capacity }} lugares
            </dd>
          </div>
          <div>
            <dt class="font-semibold text-slate-500">Horários</dt>
            <dd class="mt-0.5 text-slate-950">
              Ida às {{ driver().departureTime }} · volta
              {{ driver().returnTime ? "às " + driver().returnTime : "a combinar" }}
            </dd>
          </div>
          <div>
            <dt class="font-semibold text-slate-500">Cidades por onde passa</dt>
            <dd class="mt-0.5 text-slate-950">{{ driver().cities.join(", ") }}</dd>
          </div>
          <div class="sm:col-span-2">
            <dt class="font-semibold text-slate-500">Faculdades que atende</dt>
            <dd class="mt-0.5 text-slate-950">{{ driver().colleges.join(", ") }}</dd>
          </div>
        </dl>
      } @else {
        <form class="mt-5 grid gap-4 sm:grid-cols-2" (submit)="save($event)">
          <label class="block sm:col-span-2">
            <span class="mb-2 block text-sm font-semibold text-slate-700">Endereço de saída da van (sua casa)</span>
            <input
              class="form-control !pl-4"
              name="startAddress"
              required
              placeholder="Rua, número, bairro e cidade"
              [value]="driver().startAddress ?? ''"
            />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-slate-700">Celular</span>
            <input class="form-control !pl-4" name="phone" required type="tel" [value]="driver().phone" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-slate-700">Modelo da van</span>
            <input class="form-control !pl-4" name="vanModel" required [value]="driver().vanModel" />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-slate-700">Saída da ida</span>
            <input
              class="form-control !pl-4"
              name="departureTime"
              required
              type="time"
              [value]="driver().departureTime"
            />
          </label>
          <label class="block">
            <span class="mb-2 block text-sm font-semibold text-slate-700">Saída da volta</span>
            <input class="form-control !pl-4" name="returnTime" type="time" [value]="driver().returnTime ?? ''" />
          </label>
          <label class="block sm:col-span-2">
            <span class="mb-2 block text-sm font-semibold text-slate-700">Cidades por onde passa</span>
            <input
              class="form-control !pl-4"
              name="cities"
              required
              placeholder="Separe as cidades por vírgula"
              [value]="driver().cities.join(', ')"
            />
          </label>
          @if (error()) {
            <p class="rounded-xl bg-red-50 p-3 text-sm text-red-800 sm:col-span-2" role="alert">{{ error() }}</p>
          }
          <div class="flex flex-wrap gap-3 sm:col-span-2">
            <button class="btn-primary !px-5 !py-2.5 text-sm disabled:opacity-60" type="submit" [disabled]="busy()">
              {{ busy() ? "Salvando..." : "Salvar" }}
            </button>
            <button class="btn-secondary !px-5 !py-2.5 text-sm" type="button" (click)="editing.set(false)">
              Cancelar
            </button>
          </div>
        </form>
      }
    </section>
  `,
})
export class DriverProfileCard {
  private readonly api = inject(ApiService);
  readonly driver = input.required<Driver>();
  readonly changed = output();
  readonly unauthorized = output();
  readonly editing = signal(false);
  readonly busy = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  edit() {
    this.saved.set(false);
    this.error.set(null);
    this.editing.set(true);
  }

  async save(event: Event) {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    const field = (name: string) => String(form.get(name) ?? "").trim();
    const data: DriverProfileUpdate = {
      phone: field("phone"),
      vanModel: field("vanModel"),
      startAddress: field("startAddress"),
      departureTime: field("departureTime"),
      returnTime: field("returnTime"),
      cities: field("cities"),
    };
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.updateDriver(this.driver().id, data);
      this.editing.set(false);
      this.saved.set(true);
      this.changed.emit();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) this.unauthorized.emit();
      else this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}
