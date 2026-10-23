import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { provideRouter } from "@angular/router";
import { ApiRequestError, ApiService } from "./api.service";
import { StudentDashboard } from "./dashboard/student-dashboard";

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
