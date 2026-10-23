import { ChangeDetectionStrategy, Component, inject, input, signal } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { ApiRequestError, ApiService, type StudentToday, type VanDetail } from "../api.service";
import { Icon } from "../shared/icon";
import { DashboardHeader } from "./dashboard-header";
import { PresenceCard } from "./presence-card";
import { StatusMessage } from "./status-message";

// /painel/van/:id: informações da van; reservar, trocar ou cancelar, e confirmar "vou hoje"
@Component({
  selector: "app-van-detail-page",
  imports: [DashboardHeader, Icon, PresenceCard, RouterLink, StatusMessage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./van-detail-page.html",
})
export default class VanDetailPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  // vem da rota (withComponentInputBinding)
  readonly id = input.required<string>();

  readonly van = signal<VanDetail | null>(null);
  readonly today = signal<StudentToday | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly presenceError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly confirmingCancel = signal(false);

  constructor() {
    queueMicrotask(() => this.load());
  }

  private fail(err: Error, target = this.error) {
    if (err instanceof ApiRequestError && err.status === 401) this.logout(false);
    else target.set(err.message);
  }

  load() {
    this.loading.set(true);
    this.error.set(null);
    Promise.all([this.api.vanDetail(Number(this.id())), this.api.today()])
      .then(([van, today]) => {
        this.van.set(van);
        this.today.set(today);
      })
      .catch((err: Error) => this.fail(err))
      .finally(() => this.loading.set(false));
  }

  logout(callApi = true) {
    if (callApi) this.api.logout().catch(() => {});
    this.router.navigate(["/"]);
  }

  rating(value: number) {
    return value.toFixed(1).replace(".", ",");
  }

  async book(replace: boolean) {
    this.actionError.set(null);
    try {
      await this.api.book(this.van()!.id, replace);
      this.load();
    } catch (err) {
      this.fail(err as Error, this.actionError);
    }
  }

  async cancel() {
    this.actionError.set(null);
    try {
      await this.api.cancelBooking(this.van()!.bookingId!);
      this.confirmingCancel.set(false);
      this.load();
    } catch (err) {
      this.fail(err as Error, this.actionError);
    }
  }

  async setGoing(going: boolean) {
    this.saving.set(true);
    this.presenceError.set(null);
    try {
      this.today.set(await this.api.setGoing(going));
    } catch (err) {
      this.fail(err as Error, this.presenceError);
    } finally {
      this.saving.set(false);
    }
  }
}
