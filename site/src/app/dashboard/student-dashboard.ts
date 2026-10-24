import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, output, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { ApiRequestError, ApiService, type Student, type StudentToday, type TodayLeg, type Van } from "../api.service";
import { Icon } from "../shared/icon";
import { DashboardHeader } from "./dashboard-header";
import { DeleteAccount } from "./delete-account";
import { PresenceCard } from "./presence-card";
import { POLL_MS } from "./notification-bell";
import { StatusMessage } from "./status-message";

// Painel do estudante: "Você vai hoje?", horários de ida e volta e as vans da faculdade
@Component({
  selector: "app-student-dashboard",
  imports: [DashboardHeader, DeleteAccount, Icon, PresenceCard, RouterLink, StatusMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./student-dashboard.html",
})
export class StudentDashboard implements OnInit {
  private readonly api = inject(ApiService);
  readonly studentId = input.required<number>();
  readonly logout = output();

  readonly student = signal<Student | null>(null);
  readonly vans = signal<Van[]>([]);
  readonly today = signal<StudentToday | null>(null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly presenceError = signal<string | null>(null);
  readonly bookError = signal<string | null>(null);
  // Cada estudante fica em uma van só
  readonly currentVan = computed(() => this.vans().find((van) => van.booked) ?? null);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit() {
    this.load();
    // A previsão de chegada aparece sozinha quando o motorista inicia a rota
    const timer = setInterval(() => this.refreshToday(), POLL_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  private handleError(err: Error) {
    if (err instanceof ApiRequestError && err.status === 401) this.logout.emit();
    else this.error.set(err.message);
  }

  load() {
    this.loading.set(true);
    this.error.set(null);
    Promise.all([this.api.student(this.studentId()), this.api.vans(), this.api.today()])
      .then(([student, vans, today]) => {
        this.student.set(student);
        this.vans.set(vans);
        this.today.set(today);
      })
      .catch((err: Error) => this.handleError(err))
      .finally(() => this.loading.set(false));
  }

  refreshToday() {
    this.api.today().then((today) => this.today.set(today), () => {});
  }

  rating(value: number) {
    return value.toFixed(1).replace(".", ",");
  }

  firstName(name: string) {
    return name.split(" ")[0];
  }

  async setGoing(going: boolean) {
    this.saving.set(true);
    this.presenceError.set(null);
    try {
      this.today.set(await this.api.setGoing(going));
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) this.logout.emit();
      else this.presenceError.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  async book(van: Van) {
    this.bookError.set(null);
    try {
      await this.api.book(van.id);
      this.load();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) this.logout.emit();
      else this.bookError.set((err as Error).message);
    }
  }

  // Texto de cada perna da viagem, como na tela de referência
  legText(leg: TodayLeg, going: boolean | null): string {
    if (going === false) return "Você avisou que não vai hoje, então a van não passa no seu ponto.";
    const scheduled = leg.scheduled ? `Saída programada às ${leg.scheduled}.` : "Horário de saída a combinar com o motorista.";
    if (!leg.startedAt) {
      if (leg.eta) {
        return leg.leg === "ida"
          ? `${scheduled} Previsão de busca no seu ponto: ${leg.eta} (calculada pelos endereços de quem vai hoje).`
          : `${scheduled} Previsão de chegada em casa: ${leg.eta} (calculada pelos endereços de quem vai hoje).`;
      }
      return `${scheduled} Confirme que você vai para ver a previsão de chegada.`;
    }
    if (!leg.eta) return `A van saiu às ${leg.startedAt}. Confirme que você vai para ver a previsão de chegada.`;
    return leg.leg === "ida"
      ? `A van saiu às ${leg.startedAt}. Previsão no seu ponto: ${leg.eta}.`
      : `A van saiu às ${leg.startedAt}. Previsão de chegada em casa: ${leg.eta}.`;
  }
}
