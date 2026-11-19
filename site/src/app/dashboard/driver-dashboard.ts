import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, output, signal } from "@angular/core";
import {
  ApiRequestError,
  ApiService,
  type BookingStatus,
  type DriverDashboardData,
  type Leg,
  type Passenger,
} from "../api.service";
import { firstName } from "../shared/format";
import { Icon } from "../shared/icon";
import { DashboardHeader } from "./dashboard-header";
import { DeleteAccount } from "./delete-account";
import { CopyText } from "../shared/copy-text";
import { DocumentsCard } from "./documents-card";
import { DriverProfileCard } from "./driver-profile-card";
import { POLL_MS } from "./notification-bell";
import { StatusMessage } from "./status-message";
import { SubscriptionCard } from "./subscription-card";
import { TermsCard } from "./terms-card";

// Painel do motorista. No topo: iniciar/finalizar a ida e a volta, quem vai hoje e a rota calculada.
// Embaixo: meu perfil, assinatura, documentos e termos.
@Component({
  selector: "app-driver-dashboard",
  imports: [
    CopyText,
    DashboardHeader,
    DeleteAccount,
    DocumentsCard,
    DriverProfileCard,
    Icon,
    StatusMessage,
    SubscriptionCard,
    TermsCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./driver-dashboard.html",
})
export class DriverDashboard implements OnInit {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly driverId = input.required<number>();
  readonly logout = output();

  readonly data = signal<DriverDashboardData | null>(null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(true);
  readonly actionError = signal<string | null>(null);
  readonly busyLeg = signal<Leg | null>(null);

  ngOnInit() {
    this.load();
    // Estudantes confirmam presença o dia todo: atualiza a lista sozinha
    const timer = setInterval(() => this.refresh(), POLL_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  private handleError(err: Error, target = this.error) {
    if (err instanceof ApiRequestError && err.status === 401) this.logout.emit();
    else target.set(err.message);
  }

  load() {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .driverDashboard(this.driverId())
      .then((data) => this.data.set(data))
      .catch((err: Error) => this.handleError(err))
      .finally(() => this.loading.set(false));
  }

  refresh() {
    this.api.driverDashboard(this.driverId()).then(
      (data) => this.data.set(data),
      () => {},
    );
  }

  readonly firstName = firstName;

  initials(name: string) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("");
  }

  async setStatus(passenger: Passenger, status: BookingStatus) {
    try {
      await this.api.updateBooking(passenger.bookingId, { status });
      this.load();
    } catch (err) {
      this.handleError(err as Error, this.actionError);
    }
  }

  // Inicia a viagem: quem vai hoje recebe o aviso com a previsão de chegada
  start(leg: Leg) {
    return this.legAction(leg, () => this.api.startRoute(this.driverId(), leg));
  }

  // Finaliza a viagem (chegou na faculdade): os alunos voltam a responder "Vou" / "Não vou"
  finish(leg: Leg) {
    return this.legAction(leg, () => this.api.finishRoute(this.driverId(), leg));
  }

  private async legAction(leg: Leg, action: () => Promise<unknown>) {
    this.actionError.set(null);
    this.busyLeg.set(leg);
    try {
      await action();
      this.refresh();
    } catch (err) {
      this.handleError(err as Error, this.actionError);
    } finally {
      this.busyLeg.set(null);
    }
  }

  scrollToProfile() {
    document.getElementById("perfil")?.scrollIntoView({ behavior: "smooth" });
  }
}
