import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideRouter } from "@angular/router";
import { ApiRequestError, ApiService } from "./api.service";
import { StudentDashboard } from "./dashboard/student-dashboard";
import VanDetailPage from "./dashboard/van-detail-page";
import { DeleteAccount } from "./dashboard/delete-account";
import { SubscriptionCard } from "./dashboard/subscription-card";
import { DriverDashboard } from "./dashboard/driver-dashboard";

const day = {
  day: "2026-10-23",
  weekday: "Sexta-feira",
  going: null,
  van: { driverId: 1, driver: "Carlos", phone: "1", vehicle: "Van", pickup: "Centro", pickupTime: "06:40", status: "Confirmado", goingCount: 1 },
  legs: [
    { leg: "ida", scheduled: "06:30", startedAt: null, eta: null, predicted: false },
    { leg: "volta", scheduled: "22:40", startedAt: null, eta: null, predicted: false },
  ],
};

// Espera as promessas da API resolverem e atualiza a tela
async function settle(fixture: ComponentFixture<unknown>) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

describe("ApiService", () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));

  it("envia a presença do dia como JSON com cookie de sessão", async () => {
    const http = TestBed.inject(HttpTestingController);
    const pending = TestBed.inject(ApiService).setGoing(true);
    const req = http.expectOne("/api/attendance/today");
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual({ going: true });
    expect(req.request.withCredentials).toBe(true);
    req.flush({ ...day, going: true });
    expect((await pending).going).toBe(true);
  });

  it("traduz erros da API em ApiRequestError com o status", async () => {
    const http = TestBed.inject(HttpTestingController);
    const pending = TestBed.inject(ApiService).me();
    http.expectOne("/api/auth/me").flush({ error: "Você não está logado." }, { status: 401, statusText: "Unauthorized" });
    await expect(pending).rejects.toMatchObject({ status: 401, message: "Você não está logado." });
    await expect(pending).rejects.toBeInstanceOf(ApiRequestError);
  });
});

describe("StudentDashboard", () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }));

  it("mostra Vou hoje / Não vou hoje e a presença confirmada", async () => {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(StudentDashboard);
    fixture.componentRef.setInput("studentId", 7);
    fixture.detectChanges();
    http.expectOne("/api/students/7").flush({ id: 7, name: "Ana Souza", phone: "1", email: "a@a", address: "Centro", collegeId: 1, college: "Facens" });
    http.expectOne("/api/vans").flush([]);
    http.expectOne("/api/attendance/today").flush(day);
    await settle(fixture);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Olá, Ana");
    expect(el.textContent).toContain("Saída programada às 06:30");
    expect(el.textContent).toContain("Saída programada às 22:40");
    expect(el.textContent).toContain("Você ainda não respondeu hoje.");

    const vou = [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Vou hoje")!;
    vou.click();
    http.expectOne("/api/attendance/today").flush({ ...day, going: true });
    await settle(fixture);
    expect(el.textContent).toContain("Presença confirmada: você vai hoje.");
    http.match("/api/notifications").forEach((req) => req.flush({ unread: 0, items: [] }));
    fixture.destroy();
  });
});

describe("VanDetailPage", () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }));

  const detail = {
    id: 3, driver: "Carlos", vehicle: "Master • 12 lugares", plate: "ABC-1D23", phone: null, route: "Centro → Facens",
    cities: ["Centro", "Zona Norte"], colleges: ["Facens"], time: "06:30", returnTime: "22:40", capacity: 12, freeSeats: 4,
    rating: 4.9, booked: false, bookingId: null, bookingStatus: null, current: null,
  };

  function open(van: object) {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(VanDetailPage);
    fixture.componentRef.setInput("id", "3");
    fixture.detectChanges();
    return { http, fixture, van };
  }

  async function load(fixture: ComponentFixture<VanDetailPage>, http: HttpTestingController, van: object) {
    await settle(fixture); // queueMicrotask do load()
    http.expectOne("/api/vans/3").flush(van);
    http.expectOne("/api/attendance/today").flush(day);
    http.match("/api/notifications").forEach((req) => req.flush({ unread: 0, items: [] }));
    await settle(fixture);
  }

  it("mostra as informações e troca de van quando já existe uma reservada", async () => {
    const { http, fixture } = open(detail);
    await load(fixture, http, { ...detail, current: { driverId: 9, driver: "Fernanda", bookingId: 5 } });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Centro, Zona Norte");
    expect(el.textContent).toContain("volta às 22:40");
    expect(el.textContent).toContain("Você já está na van de Fernanda");
    expect(el.textContent).not.toContain("Você vai hoje?");
    [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Trocar para esta van"))!.click();
    const req = http.expectOne("/api/bookings");
    expect(req.request.body).toEqual({ driverId: 3, replace: true });
    req.flush({ id: 1, status: "Aguardando" });
    await settle(fixture);
    http.match("/api/vans/3").forEach((r) => r.flush({ ...detail, booked: true, bookingId: 1, bookingStatus: "Aguardando", phone: "(15) 90000-0000" }));
    http.match("/api/attendance/today").forEach((r) => r.flush(day));
    fixture.destroy();
  });

  it("na van reservada confirma Vou hoje", async () => {
    const { http, fixture } = open(detail);
    await load(fixture, http, { ...detail, booked: true, bookingId: 1, bookingStatus: "Confirmado", phone: "(15) 90000-0000" });
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Você vai hoje?");
    expect(el.textContent).toContain("(15) 90000-0000");
    [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Vou hoje")!.click();
    http.expectOne("/api/attendance/today").flush({ ...day, going: true });
    await settle(fixture);
    expect(el.textContent).toContain("Presença confirmada: você vai hoje.");
    fixture.destroy();
  });
});

describe("DeleteAccount", () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));

  it("pede a senha e avisa quando a conta foi excluída", async () => {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(DeleteAccount);
    let deleted = 0;
    fixture.componentInstance.deleted.subscribe(() => deleted++);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    (el.querySelector("button") as HTMLButtonElement).click();
    await settle(fixture);
    const input = el.querySelector("input") as HTMLInputElement;
    input.value = "minha-senha";
    input.dispatchEvent(new Event("input"));
    (el.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit"));
    const req = http.expectOne("/api/account/delete");
    expect(req.request.body).toEqual({ password: "minha-senha" });
    req.flush({ error: "Senha incorreta." }, { status: 401, statusText: "Unauthorized" });
    await settle(fixture);
    expect(el.textContent).toContain("Senha incorreta.");
    expect(deleted).toBe(0);
    (el.querySelector("form") as HTMLFormElement).dispatchEvent(new Event("submit"));
    http.expectOne("/api/account/delete").flush({ ok: true });
    await settle(fixture);
    expect(deleted).toBe(1);
  });
});

describe("SubscriptionCard", () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));

  const base = { enabled: true, price: 29.9, days: 30, simulated: true, until: null, active: false, daysLeft: null };

  function open(subscription: object) {
    const fixture = TestBed.createComponent(SubscriptionCard);
    fixture.componentRef.setInput("driverId", 7);
    fixture.componentRef.setInput("subscription", subscription);
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
  }

  it("avisa que a van está oculta e deixa assinar (simulado)", async () => {
    const { fixture, http, el } = open(base);
    expect(el.textContent).toContain("Assine para liberar sua van");
    expect(el.textContent).toContain("oculta para novos alunos");
    expect(el.textContent).toContain("Pagamento simulado");
    let changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    const botao = el.querySelector("button")!;
    expect(botao.textContent).toContain("R$");
    botao.click();
    const req = http.expectOne("/api/drivers/7/subscription");
    expect(req.request.method).toBe("POST");
    req.flush({ ...base, active: true, until: "2026-11-23", daysLeft: 30 });
    await settle(fixture);
    expect(changed).toBe(1);
  });

  it("mostra a validade e permite renovar; some quando a cobrança está desligada", () => {
    const ativa = open({ ...base, active: true, until: "2026-11-23", daysLeft: 3 });
    expect(ativa.el.textContent).toContain("em dia até 23/11/2026");
    expect(ativa.el.textContent).toContain("Faltam 3 dias");
    expect(ativa.el.querySelector("button")!.textContent).toContain("Renovar");
    const desligada = open({ ...base, enabled: false, active: true });
    expect(desligada.el.querySelector("section")).toBeNull();
  });
});

describe("DriverDashboard", () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }));

  const url = "https://www.google.com/maps/dir/?api=1&destination=Fatec+Sorocaba+SP&waypoints=-23.5%2C-47.4";
  const route = { destination: "Fatec", totalMinutes: 20, distanceKm: 8, arrival: "18:10", mapsLinks: [{ label: "Abrir no Google Maps", url }],
    stops: [{ studentId: 1, name: "Ana", pickup: "Rua A", order: 1, eta: "17:50" }] };
  const leg = (name: string) => ({ leg: name, scheduled: "17:30", startedAt: null, eta: null, predicted: true, route });
  const dashboard = {
    driver: { id: 5, name: "Carlos", freeSeats: 3, occupied: 1, capacity: 4, departureTime: "17:30", cities: ["Sorocaba"], colleges: ["Fatec"] },
    passengers: [], mainDestination: "Fatec",
    today: { day: "2026-10-24", weekday: "Sábado", going: 1, notGoing: 0, pending: 0, legs: [leg("ida"), leg("volta")] },
    subscription: { enabled: false, price: 29.9, days: 30, simulated: true, until: null, active: true, daysLeft: null },
  };

  it("mostra o botão do Google Maps e abre a rota ao iniciar a ida", async () => {
    const tab = { location: { href: "" }, close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
    const fixture = TestBed.createComponent(DriverDashboard);
    fixture.componentRef.setInput("driverId", 5);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne("/api/drivers/5/dashboard").flush(dashboard);
    await settle(fixture);
    const el: HTMLElement = fixture.nativeElement;
    const botoes = [...el.querySelectorAll("a")].filter((a) => a.textContent?.includes("Abrir no Google Maps"));
    expect(botoes.length).toBe(2);
    expect(botoes[0]!.getAttribute("href")).toBe(url);

    [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Iniciar ida"))!.click();
    expect(open).toHaveBeenCalledWith("", "_blank");
    http.expectOne("/api/drivers/5/route-runs").flush(dashboard.today);
    await settle(fixture);
    expect(tab.location.href).toBe(url);
    http.match("/api/drivers/5/dashboard").forEach((req) => req.flush(dashboard));
    http.match("/api/notifications").forEach((req) => req.flush({ unread: 0, items: [] }));
    open.mockRestore();
    fixture.destroy();
  });
});
