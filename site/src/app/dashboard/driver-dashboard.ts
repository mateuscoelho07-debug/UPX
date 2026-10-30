import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, output, signal } from "@angular/core";
import { ApiRequestError, ApiService, type BookingStatus, type DriverDashboardData, type Leg, type Passenger } from "../api.service";
import { Icon } from "../shared/icon";
import { DashboardHeader } from "./dashboard-header";
import { DeleteAccount } from "./delete-account";
import { SubscriptionCard } from "./subscription-card";
import { TermsCard } from "./terms-card";
import { POLL_MS } from "./notification-bell";
import { StatusMessage } from "./status-message";

// Painel do motorista: quem vai hoje, rota do dia e botões para iniciar a ida e a volta
@Component({
  selector: "app-driver-dashboard",
  imports: [DashboardHeader, DeleteAccount, Icon, StatusMessage, SubscriptionCard, TermsCard],
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
    this.api.driverDashboard(this.driverId())
      .then((data) => this.data.set(data))
      .catch((err: Error) => this.handleError(err))
      .finally(() => this.loading.set(false));
  }

  refresh() {
    this.api.driverDashboard(this.driverId()).then((data) => this.data.set(data), () => {});
  }

  firstName(name: string) {
    return name.split(" ")[0];
  }

  initials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");
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
  async start(leg: Leg) {
    this.actionError.set(null);
    try {
      await this.api.startRoute(this.driverId(), leg);
      this.refresh();
    } catch (err) {
      this.handleError(err as Error, this.actionError);
    }
  }
}
