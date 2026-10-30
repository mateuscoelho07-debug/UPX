import { ChangeDetectionStrategy, Component, inject, input, output, signal } from "@angular/core";
import { ApiRequestError, ApiService, type DocumentKind, type DriverDocument } from "../api.service";

const MAX_BYTES = 2 * 1024 * 1024;

// Documentos do motorista (CNH e CRLV): o arquivo fica guardado no banco e só o próprio motorista abre.
// Os alunos da van veem apenas o aviso "documentos enviados".
@Component({
  selector: "app-documents-card",
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mt-8 rounded-3xl border border-slate-200 bg-white p-6" aria-label="Documentos do veículo">
      <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Documentos do veículo</span>
      <h2 class="mt-2 text-lg font-extrabold text-slate-950">{{ allSent() ? "Documentos enviados" : "Envie a CNH e o CRLV" }}</h2>
      <p class="mt-1 text-sm text-slate-600">
        JPG, PNG ou PDF, até 2 MB cada. Só você abre os arquivos; os alunos veem apenas o aviso "documentos enviados".
      </p>
      <ul class="mt-4 divide-y divide-slate-100">
        @for (item of kinds; track item.kind) {
          <li class="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <strong class="text-slate-950">{{ item.label }}</strong>
              <span class="ml-2 text-xs font-bold" [class]="sent(item.kind) ? 'text-emerald-700' : 'text-amber-700'">{{ sent(item.kind) ? "Enviado" : "Pendente" }}</span>
              <p class="text-sm text-slate-500">{{ item.hint }}</p>
              @if (sent(item.kind); as file) {
                <p class="mt-1 text-sm text-slate-700">{{ file.filename }} · {{ size(file) }}</p>
              }
            </div>
            <div class="flex flex-wrap items-center gap-3 text-sm">
              <label class="btn-secondary cursor-pointer !px-4 !py-2" [class.opacity-50]="busy()">
                {{ sent(item.kind) ? "Trocar arquivo" : "Escolher arquivo" }}
                <input class="sr-only" type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" [disabled]="busy()" (change)="pick(item.kind, $event)" />
              </label>
              @if (sent(item.kind)) {
                <a class="font-semibold text-blue-700 underline" [href]="'/api/drivers/' + driverId() + '/documents/' + item.kind + '/file'">Baixar</a>
                <button class="font-semibold text-slate-500 underline hover:text-red-700" type="button" [disabled]="busy()" (click)="remove(item.kind)">Remover</button>
              }
            </div>
          </li>
        }
      </ul>
      @if (error()) {
        <p class="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">{{ error() }}</p>
      }
    </section>
  `,
})
export class DocumentsCard {
  private readonly api = inject(ApiService);
  readonly driverId = input.required<number>();
  readonly documents = input.required<DriverDocument[]>();
  readonly changed = output();
  readonly unauthorized = output();

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly kinds: { kind: DocumentKind; label: string; hint: string }[] = [
    { kind: "cnh", label: "CNH", hint: "Carteira Nacional de Habilitação (frente e verso na mesma imagem ou PDF)." },
    { kind: "crlv", label: "CRLV", hint: "Documento do veículo (licenciamento atual)." },
  ];

  sent(kind: DocumentKind) {
    return this.documents().find((doc) => doc.kind === kind) ?? null;
  }

  allSent() {
    return this.kinds.every((item) => this.sent(item.kind));
  }

  size(doc: DriverDocument) {
    return doc.size >= 1024 * 1024 ? `${(doc.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(Math.round(doc.size / 1024), 1)} KB`;
  }

  async pick(kind: DocumentKind, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    this.error.set(null);
    if (file.size > MAX_BYTES) {
      this.error.set("O arquivo é grande demais. O limite é 2 MB.");
      return;
    }
    await this.run(async () => this.api.uploadDocument(this.driverId(), kind, file.name, await toBase64(file)));
  }

  remove(kind: DocumentKind) {
    return this.run(() => this.api.deleteDocument(this.driverId(), kind));
  }

  private async run(action: () => Promise<unknown>) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
      this.changed.emit();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) this.unauthorized.emit();
      else this.error.set((err as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}
