// Página de administração (/admin): mostra o conteúdo do banco, somente leitura.
// Exige a senha definida na variável ADMIN_PASSWORD do servidor.
import { ChangeDetectionStrategy, Component, inject, signal, computed } from "@angular/core";
import { RouterLink } from "@angular/router";
import { ApiRequestError, ApiService, type AdminOverview, type AdminRow } from "../api.service";

type TableKey = "colleges" | "students" | "drivers" | "bookings" | "attendance" | "searches";

const tables: { key: TableKey; label: string; columns: [string, string][] }[] = [
  {
    key: "students",
    label: "Estudantes",
    columns: [["id", "ID"], ["name", "Nome"], ["email", "E-mail"], ["phone", "Celular"], ["address", "Endereço"], ["college", "Faculdade"], ["createdAt", "Cadastro"]],
  },
  {
    key: "drivers",
    label: "Motoristas",
    columns: [["id", "ID"], ["name", "Nome"], ["email", "E-mail"], ["phone", "Celular"], ["vanModel", "Van"], ["plate", "Placa"], ["occupied", "Ocupados"], ["capacity", "Lugares"], ["departureTime", "Ida"], ["returnTime", "Volta"], ["rating", "Nota"], ["cities", "Cidades"], ["colleges", "Faculdades"], ["createdAt", "Cadastro"]],
  },
  {
    key: "bookings",
    label: "Reservas",
    columns: [["id", "ID"], ["student", "Estudante"], ["driver", "Motorista"], ["pickup", "Embarque"], ["pickupTime", "Horário"], ["status", "Status"], ["createdAt", "Criada em"]],
  },
  {
    key: "attendance",
    label: "Presenças",
    columns: [["day", "Dia"], ["student", "Estudante"], ["driver", "Motorista"], ["going", "Resposta"], ["createdAt", "Atualizada em"]],
  },
  {
    key: "colleges",
    label: "Faculdades",
    columns: [["id", "ID"], ["name", "Nome"], ["students", "Estudantes"], ["drivers", "Motoristas"]],
  },
  {
    key: "searches",
    label: "Buscas",
    columns: [["id", "ID"], ["address", "Endereço"], ["college", "Faculdade"], ["results", "Vans encontradas"], ["createdAt", "Data"]],
  },
];

const statusStyles: Record<string, string> = {
  Confirmado: "bg-emerald-50 text-emerald-700",
  Aguardando: "bg-amber-50 text-amber-700",
  Cancelado: "bg-slate-100 text-slate-500",
};

@Component({
  selector: "app-admin-page",
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./admin-page.html",
})
export default class AdminPage {
  private readonly api = inject(ApiService);

  readonly tables = tables;
  readonly statusStyles = statusStyles;
  readonly data = signal<AdminOverview | null>(null);
  readonly active = signal<TableKey>("students");
  readonly filter = signal("");
  readonly error = signal<string | null>(null);
  readonly loading = signal(true);
  readonly password = signal("");
  readonly needsLogin = signal(false);

  readonly table = computed(() => tables.find((item) => item.key === this.active())!);
  readonly term = computed(() => this.filter().trim().toLowerCase());
  readonly rows = computed(() =>
    (this.data()?.[this.active()] ?? []).filter((row) =>
      !this.term() || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(this.term())),
    ),
  );

  constructor() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set(null);
    this.api.adminOverview()
      .then((overview) => {
        this.data.set(overview);
        this.needsLogin.set(false);
      })
      .catch((err: Error) => {
        // 401/403: falta entrar como administrador; 503: painel desativado no servidor
        const status = err instanceof ApiRequestError ? err.status : 0;
        this.data.set(null);
        this.needsLogin.set(status === 401 || status === 403);
        this.error.set(status === 401 || status === 403 ? null : err.message);
      })
      .finally(() => this.loading.set(false));
  }

  async submitLogin(event: Event) {
    event.preventDefault();
    this.error.set(null);
    try {
      await this.api.adminLogin(this.password());
      this.password.set("");
      this.load();
    } catch (err) {
      this.error.set((err as Error).message);
    }
  }

  async logout() {
    await this.api.logout().catch(() => {});
    this.data.set(null);
    this.needsLogin.set(true);
  }

  input(event: Event) {
    return (event.target as HTMLInputElement).value;
  }

  // O SQLite guarda datas em UTC ("2026-10-22 18:00:00"); mostra no horário local
  formatCell(column: string, value: AdminRow[string] | undefined) {
    if (value === null || value === undefined || value === "") return "—";
    if (column === "createdAt" && typeof value === "string") {
      const date = new Date(value.replace(" ", "T") + "Z");
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
    }
    if (column === "rating" && typeof value === "number") return value.toFixed(1).replace(".", ",");
    return String(value);
  }

  count(key: TableKey) {
    return this.data()?.[key].length ?? 0;
  }

  rowKey(row: AdminRow, index: number) {
    return `${row["id"] ?? ""}-${index}`;
  }
}
