import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideRouter } from "@angular/router";
import { ApiRequestError, ApiService } from "./api.service";
import { StudentDashboard } from "./dashboard/student-dashboard";
import VanDetailPage from "./dashboard/van-detail-page";
import { DeleteAccount } from "./dashboard/delete-account";

const day = {
  day: "2026-10-23",
  weekday: "Sexta-feira",
  going: null,
  van: { driverId: 1, driver: "Carlos", phone: "1", vehicle: "Van", pickup: "Centro", pickupTime: "06:40", status: "Confirmado", goingCount: 1 },
  legs: [
    { leg: "ida", scheduled: "06:30", startedAt: null, eta: null },
    { leg: "volta", scheduled: "22:40", startedAt: null, eta: null },
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
