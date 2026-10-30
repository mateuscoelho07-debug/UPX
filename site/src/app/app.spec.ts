import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideRouter } from "@angular/router";
import { ApiRequestError, ApiService } from "./api.service";
import { StudentDashboard } from "./dashboard/student-dashboard";
import VanDetailPage from "./dashboard/van-detail-page";
import { DeleteAccount } from "./dashboard/delete-account";
import { SubscriptionCard } from "./dashboard/subscription-card";
import { DocumentsCard } from "./dashboard/documents-card";
import { TermsCard } from "./dashboard/terms-card";
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
    rating: 4.9, booked: false, documentsSent: true, bookingId: null, bookingStatus: null, current: null,
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

describe("DocumentsCard", () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));

  function open(documents: object[]) {
    const fixture = TestBed.createComponent(DocumentsCard);
    fixture.componentRef.setInput("driverId", 7);
    fixture.componentRef.setInput("documents", documents);
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
  }

  const cnh = { kind: "cnh", filename: "cnh.png", mime: "image/png", size: 2048, uploadedAt: "2026-10-30 12:00:00" };

  it("mostra o que falta enviar e o que já foi enviado", () => {
    const { el } = open([cnh]);
    expect(el.textContent).toContain("Envie a CNH e o CRLV");
    expect(el.textContent).toContain("cnh.png · 2 KB");
    expect(el.textContent).toContain("Pendente");
    expect(el.querySelector("a")!.getAttribute("href")).toBe("/api/drivers/7/documents/cnh/file");
  });

  it("envia o arquivo escolhido em base64 e recusa o que passa de 2 MB", async () => {
    const { fixture, http, el } = open([]);
    let changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    const input = el.querySelector<HTMLInputElement>("input[type=file]")!;
    const choose = (file: File) => {
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      input.dispatchEvent(new Event("change"));
    };

    choose(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "grande.pdf"));
    await settle(fixture);
    expect(el.textContent).toContain("limite é 2 MB");
    http.expectNone("/api/drivers/7/documents/cnh");

    choose(new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const req = http.expectOne("/api/drivers/7/documents/cnh");
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual({ filename: "foto.jpg", data: "/9j/" });
    req.flush([cnh]);
    await settle(fixture);
    expect(changed).toBe(1);
  });
});

describe("TermsCard", () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }));

  function open(terms: object) {
    const fixture = TestBed.createComponent(TermsCard);
    fixture.componentRef.setInput("driverId", 7);
    fixture.componentRef.setInput("terms", terms);
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement as HTMLElement };
  }

  it("pede o aceite, envia e oferece o PDF com a assinatura", async () => {
    const { fixture, http, el } = open({ version: "1.0", acceptedVersion: null, acceptedAt: null, accepted: false });
    expect(el.textContent).toContain("Aceite os termos");
    let changed = 0;
    fixture.componentInstance.changed.subscribe(() => changed++);
    el.querySelector<HTMLButtonElement>("button")!.click();
    const req = http.expectOne("/api/drivers/7/terms-acceptance");
    expect(req.request.method).toBe("POST");
    req.flush({ version: "1.0" });
    await settle(fixture);
    expect(changed).toBe(1);
    expect(el.querySelector<HTMLAnchorElement>("a[download]")!.getAttribute("href")).toBe("/api/terms.pdf?driverId=7");
  });

  it("mostra a data do aceite em horário de Brasília", () => {
    const { el } = open({ version: "1.0", acceptedVersion: "1.0", acceptedAt: "2026-10-30 12:14:05", accepted: true });
    expect(el.textContent).toContain("Termos aceitos em 30/10/2026");
    expect(el.textContent).toContain("09:14");
    expect(el.querySelector("button")).toBeNull();
  });
});

describe("DriverDashboard", () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }));

  const route = { destination: "Fatec", totalMinutes: 20, distanceKm: 8, arrival: "18:10",
    stops: [{ studentId: 1, name: "Ana", pickup: "Rua A", order: 1, eta: "17:50" }] };
  const leg = (name: string) => ({ leg: name, scheduled: "17:30", startedAt: null, eta: null, predicted: true, route });
  const dashboard = {
    driver: { id: 5, name: "Carlos", freeSeats: 3, occupied: 1, capacity: 4, departureTime: "17:30", cities: ["Sorocaba"], colleges: ["Fatec"] },
    passengers: [], mainDestination: "Fatec",
    today: { day: "2026-10-24", weekday: "Sábado", going: 1, notGoing: 0, pending: 0, legs: [leg("ida"), leg("volta")] },
    subscription: { enabled: false, price: 29.9, days: 30, simulated: true, until: null, active: true, daysLeft: null },
    documents: [],
    terms: { version: "1.0", acceptedVersion: null, acceptedAt: null, accepted: false },
  };

  it("mostra a rota calculada e inicia a ida sem abrir nenhuma aba", async () => {
    const open = vi.spyOn(window, "open");
    const fixture = TestBed.createComponent(DriverDashboard);
    fixture.componentRef.setInput("driverId", 5);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne("/api/drivers/5/dashboard").flush(dashboard);
    await settle(fixture);
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Rota calculada pelos endereços");
    expect(el.textContent).toContain("17:50");
    expect(el.textContent).not.toContain("Google Maps");

    [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Iniciar ida"))!.click();
    const req = http.expectOne("/api/drivers/5/route-runs");
    expect(req.request.body).toEqual({ leg: "ida" });
    req.flush(dashboard.today);
    await settle(fixture);
    expect(open).not.toHaveBeenCalled();
    http.match("/api/drivers/5/dashboard").forEach((r) => r.flush(dashboard));
    http.match("/api/notifications").forEach((r) => r.flush({ unread: 0, items: [] }));
    open.mockRestore();
    fixture.destroy();
  });
});
