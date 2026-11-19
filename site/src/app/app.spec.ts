// Testes das telas Angular (Vitest + jsdom), com a API simulada.
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
import { NotificationBell } from "./dashboard/notification-bell";
import HomePage from "./home/home-page";

const day = {
  day: "2026-10-23",
  weekday: "Sexta-feira",
  going: null,
  van: {
    driverId: 1,
    driver: "Carlos",
    phone: "1",
    vehicle: "Van",
    pickup: "Centro",
    pickupTime: "06:40",
    status: "Confirmado",
    goingCount: 1,
  },
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
    http
      .expectOne("/api/auth/me")
      .flush({ error: "Você não está logado." }, { status: 401, statusText: "Unauthorized" });
    await expect(pending).rejects.toMatchObject({ status: 401, message: "Você não está logado." });
    await expect(pending).rejects.toBeInstanceOf(ApiRequestError);
  });
});

describe("StudentDashboard", () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }),
  );

  it("mostra Vou hoje / Não vou hoje e a presença confirmada", async () => {
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(StudentDashboard);
    fixture.componentRef.setInput("studentId", 7);
    fixture.detectChanges();
    http.expectOne("/api/students/7").flush({
      id: 7,
      name: "Ana Souza",
      phone: "1",
      email: "a@a",
      address: "Centro",
      collegeId: 1,
      college: "Facens",
    });
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
  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }),
  );

  const detail = {
    id: 3,
    driver: "Carlos",
    vehicle: "Master • 12 lugares",
    plate: "ABC-1D23",
    phone: null,
    route: "Centro → Facens",
    cities: ["Centro", "Zona Norte"],
    colleges: ["Facens"],
    time: "06:30",
    returnTime: "22:40",
    capacity: 12,
    freeSeats: 4,
    rating: 4.9,
    booked: false,
    documentsSent: true,
    bookingId: null,
    bookingStatus: null,
    current: null,
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
    http
      .match("/api/vans/3")
      .forEach((r) =>
        r.flush({ ...detail, booked: true, bookingId: 1, bookingStatus: "Aguardando", phone: "(15) 90000-0000" }),
      );
    http.match("/api/attendance/today").forEach((r) => r.flush(day));
    fixture.destroy();
  });

  it("na van reservada confirma Vou hoje", async () => {
    const { http, fixture } = open(detail);
    await load(fixture, http, {
      ...detail,
      booked: true,
      bookingId: 1,
      bookingStatus: "Confirmado",
      phone: "(15) 90000-0000",
    });
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
  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }),
  );

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
  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }),
  );

  const route = {
    origin: "Avenida Paraná, 4495 - Sorocaba",
    destination: "Fatec",
    end: { minutes: 12, km: 5.1 },
    totalMinutes: 20,
    distanceKm: 8,
    arrival: "18:10",
    stops: [{ studentId: 1, name: "Ana", pickup: "Rua A, 10", order: 1, eta: "17:50", legMinutes: 6, legKm: 2.4 }],
  };
  const leg = (name: string) => ({ leg: name, scheduled: "17:30", startedAt: null, eta: null, predicted: true, route });
  const dashboard = {
    driver: {
      id: 5,
      name: "Carlos",
      freeSeats: 3,
      occupied: 1,
      capacity: 4,
      departureTime: "17:30",
      returnTime: "22:40",
      startAddress: "Avenida Paraná, 4495 - Sorocaba",
      email: "carlos@teste.com",
      phone: "(15) 1",
      vanModel: "Master",
      plate: "ABC-1D23",
      cities: ["Sorocaba"],
      colleges: ["Fatec"],
    },
    passengers: [],
    mainDestination: "Fatec",
    today: {
      day: "2026-10-24",
      weekday: "Sábado",
      going: 1,
      notGoing: 0,
      pending: 0,
      legs: [leg("ida"), leg("volta")],
    },
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
    expect(el.textContent).toContain("Quem vai na rota");
    expect(el.textContent).toContain("17:50");
    expect(el.textContent).toContain("Saída: sua casa");
    expect(el.textContent).toContain("↓ 6 min · 2.4 km");
    expect(el.textContent).toContain("Chegada: Fatec");
    // rota e iniciar no topo; assinatura, documentos e termos embaixo
    const text = el.textContent!;
    expect(text.indexOf("Iniciar rota")).toBeLessThan(text.indexOf("Quem vai na rota"));
    expect(text.indexOf("Lista de embarque")).toBeLessThan(text.indexOf("Documentos do veículo"));
    expect(text.indexOf("Lista de embarque")).toBeLessThan(text.indexOf("Termos e Segurança"));
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

describe("DriverDashboard: finalizar, copiar endereço e perfil", () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }),
  );

  const route = {
    origin: "Avenida Paraná, 4495 - Sorocaba",
    destination: "Fatec",
    end: null,
    totalMinutes: 20,
    distanceKm: 8,
    arrival: "18:10",
    stops: [{ studentId: 1, name: "Ana", pickup: "Rua A, 10", order: 1, eta: "17:50", legMinutes: 6, legKm: 2.4 }],
  };
  const driver = {
    id: 5,
    name: "Carlos",
    email: "carlos@teste.com",
    phone: "(15) 1",
    vanModel: "Master",
    plate: "ABC-1D23",
    freeSeats: 3,
    occupied: 1,
    capacity: 4,
    departureTime: "17:30",
    returnTime: "22:40",
    startAddress: "Avenida Paraná, 4495 - Sorocaba",
    cities: ["Sorocaba"],
    colleges: ["Fatec"],
  };
  const dashboard = (startedAt: string | null) => ({
    driver,
    passengers: [
      {
        bookingId: 1,
        studentId: 1,
        name: "Ana",
        pickup: "Rua A, 10",
        pickupTime: null,
        college: "Fatec",
        status: "Confirmado",
        going: true,
      },
    ],
    mainDestination: "Fatec",
    today: {
      day: "2026-11-20",
      weekday: "Sexta-feira",
      going: 1,
      notGoing: 0,
      pending: 0,
      legs: [
        { leg: "ida", scheduled: "17:30", startedAt, finishedAt: null, eta: null, predicted: !startedAt, route },
        { leg: "volta", scheduled: "22:40", startedAt: null, finishedAt: null, eta: null, predicted: true, route },
      ],
    },
    subscription: { enabled: false, price: 29.9, days: 30, simulated: true, until: null, active: true, daysLeft: null },
    documents: [],
    terms: { version: "1.0", acceptedVersion: "1.0", acceptedAt: "2026-11-01 10:00:00", accepted: true },
  });

  async function open(data: object) {
    const fixture = TestBed.createComponent(DriverDashboard);
    fixture.componentRef.setInput("driverId", 5);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne("/api/drivers/5/dashboard").flush(data);
    await settle(fixture);
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }
  const button = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;

  it("com a ida em andamento, mostra o botão de finalizar ao chegar na faculdade", async () => {
    const { fixture, http, el } = await open(dashboard("17:31"));
    expect(el.textContent).toContain("Em andamento desde 17:31");
    button(el, "Cheguei na faculdade").click();
    const req = http.expectOne("/api/drivers/5/route-runs/finish");
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({ leg: "ida" });
    req.flush({});
    await settle(fixture);
    http.match("/api/drivers/5/dashboard").forEach((r) => r.flush(dashboard(null)));
    http.match("/api/notifications").forEach((r) => r.flush({ unread: 0, items: [] }));
    fixture.destroy();
  });

  it("copia o endereço do passageiro ao clicar", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { fixture, http, el } = await open(dashboard(null));
    const copiar = el.querySelector<HTMLButtonElement>('button[aria-label="Copiar endereço: Rua A, 10"]')!;
    copiar.click();
    await settle(fixture);
    expect(writeText).toHaveBeenCalledWith("Rua A, 10");
    expect(el.textContent).toContain("Copiado!");
    http.match("/api/notifications").forEach((r) => r.flush({ unread: 0, items: [] }));
    fixture.destroy();
  });

  it("meu perfil mostra o e-mail e salva o endereço de saída", async () => {
    const { fixture, http, el } = await open(dashboard(null));
    expect(el.textContent).toContain("carlos@teste.com");
    expect(el.textContent).toContain("Avenida Paraná, 4495 - Sorocaba");
    button(el, "Editar dados").click();
    fixture.detectChanges();
    const address = el.querySelector<HTMLInputElement>('input[name="startAddress"]')!;
    address.value = "Rua Nova, 50 - Campolim";
    el.querySelector<HTMLFormElement>("#perfil form")!.dispatchEvent(new Event("submit"));
    const req = http.expectOne("/api/drivers/5");
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toMatchObject({ startAddress: "Rua Nova, 50 - Campolim", phone: "(15) 1" });
    req.flush({ ...driver, startAddress: "Rua Nova, 50 - Campolim" });
    await settle(fixture);
    http.match("/api/drivers/5/dashboard").forEach((r) => r.flush(dashboard(null)));
    await settle(fixture);
    expect(el.textContent).toContain("Dados atualizados.");
    http.match("/api/notifications").forEach((r) => r.flush({ unread: 0, items: [] }));
    fixture.destroy();
  });
});

describe("StudentDashboard: comparar vans", () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }),
  );

  it("destaca a van com a chegada mais rápida e mostra entrada na van e chegada em casa", async () => {
    const van = (id: number, name: string, pickup: string, fastest: boolean) => ({
      id,
      driver: name,
      vehicle: "Master • 15 lugares",
      route: "Sorocaba → UniFacens",
      time: "17:50",
      returnTime: "22:40",
      capacity: 15,
      freeSeats: 10,
      rating: 5,
      booked: fastest,
      documentsSent: false,
      estimate: { pickup, collegeArrival: "18:28", homeArrival: "23:05", pickupMinutes: 6, homeMinutes: 25 },
      fastest,
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(StudentDashboard);
    fixture.componentRef.setInput("studentId", 7);
    fixture.detectChanges();
    http.expectOne("/api/students/7").flush({
      id: 7,
      name: "EstudanteUpx",
      phone: "1",
      email: "e@e",
      address: "Rua José Leite do Canto Júnior, 441",
      collegeId: 1,
      college: "UniFacens",
    });
    http.expectOne("/api/vans").flush([van(1, "MotoUpx", "17:56", true), van(2, "Outra", "18:20", false)]);
    http.expectOne("/api/attendance/today").flush(day);
    await settle(fixture);
    const cards = [...(fixture.nativeElement as HTMLElement).querySelectorAll("section article")];
    const moto = cards.find((c) => c.textContent?.includes("MotoUpx"))!;
    const outra = cards.find((c) => c.textContent?.includes("Outra"))!;
    expect(moto.textContent).toContain("Chegada mais rápida");
    expect(moto.textContent).toContain("Entrada na van");
    expect(moto.textContent).toContain("~17:56");
    expect(moto.textContent).toContain("Chegada em casa");
    expect(moto.textContent).toContain("~23:05");
    expect(outra.textContent).not.toContain("Chegada mais rápida");
    expect(outra.textContent).not.toContain("Melhor opção");
    http.match("/api/notifications").forEach((r) => r.flush({ unread: 0, items: [] }));
    fixture.destroy();
  });
});

describe("Avisos e janelas fecham ao clicar fora", () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }),
  );

  it("o sino fecha com um clique em qualquer lugar da tela", async () => {
    const fixture = TestBed.createComponent(NotificationBell);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    const http = TestBed.inject(HttpTestingController);
    http.match("/api/notifications").forEach((r) => r.flush({ unread: 0, items: [] }));
    const el: HTMLElement = fixture.nativeElement;
    el.querySelector("button")!.click();
    fixture.detectChanges();
    expect(el.textContent).toContain("Nenhum aviso por enquanto.");
    // clique dentro da lista não fecha
    el.querySelector("strong")!.click();
    fixture.detectChanges();
    expect(el.textContent).toContain("Nenhum aviso por enquanto.");
    document.body.click();
    fixture.detectChanges();
    expect(el.textContent).not.toContain("Nenhum aviso por enquanto.");
    // Esc também fecha
    el.querySelector("button")!.click();
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    fixture.detectChanges();
    expect(el.textContent).not.toContain("Nenhum aviso por enquanto.");
    fixture.destroy();
  });

  it("a janela de cadastro/login fecha ao clicar no fundo, mas não ao clicar dentro", async () => {
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const page = fixture.componentInstance;
    page.openSignup("driver");
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const backdrop = el.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(el.querySelector('input[name="startAddress"]')).not.toBeNull(); // cadastro de motorista pede a saída
    const inside = backdrop.firstElementChild as HTMLElement;
    inside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    inside.click();
    fixture.detectChanges();
    expect(page.modalOpen()).toBe(true);
    backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    backdrop.click();
    fixture.detectChanges();
    expect(page.modalOpen()).toBe(false);
    fixture.destroy();
  });
});
