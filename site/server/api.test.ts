// Testes da API: `pnpm test:api`
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "./index.ts";
import { DEMO_PASSWORD, openDatabase } from "./db.ts";

let server: Server;
let base: string;
const ADMIN_PASSWORD = "senha-do-admin";

before(async () => {
  server = createApp(openDatabase(":memory:"), { adminPassword: ADMIN_PASSWORD }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}/api`;
});

after(() => server.close());

// Cada "navegador" guarda o próprio cookie de sessão
function browser() {
  let cookie = "";
  return {
    get cookie() {
      return cookie;
    },
    async call(method: string, url: string, body?: unknown): Promise<{ status: number; body: any; setCookie: string | null }> {
      const res = await fetch(base + url, {
        method,
        headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0]!.endsWith("=") ? "" : setCookie.split(";")[0]!;
      return { status: res.status, body: await res.json(), setCookie };
    },
  };
}

const call = (method: string, url: string, body?: unknown) => browser().call(method, url, body);

const newDriver = {
  name: "Joana Souza", phone: "(15) 90000-0000", email: "joana@teste.com", password: "joana-segura",
  vanModel: "Iveco Daily", plate: "abc-1d23", capacity: 1, departureTime: "07:10",
  cities: "Votorantim, Sorocaba", colleges: "Ufscar, Nova Faculdade",
};
const newStudent = {
  name: "Rafa", phone: "(15) 91111-1111", email: "rafa@teste.com", password: "rafa-segura",
  address: "Rua A, 10, Votorantim", college: "ufscar",
};

test("lista as faculdades do seed", async () => {
  const { status, body } = await call("GET", "/colleges");
  assert.equal(status, 200);
  assert.deepEqual(body.map((c: { name: string }) => c.name).sort(), ["Fatec", "UniFacens", "Ufscar", "Uniso", "Unip"].sort());
});

test("busca registra a pesquisa e conta as vans", async () => {
  const { status, body } = await call("POST", "/searches", { address: "Centro, Sorocaba", college: "UniFacens" });
  assert.equal(status, 201);
  assert.equal(body.count, 2);
});

test("cadastro exige senha de pelo menos 8 caracteres", async () => {
  const semSenha = await call("POST", "/students", { ...newStudent, email: "x@teste.com", password: undefined });
  assert.equal(semSenha.status, 400);
  assert.match(semSenha.body.error, /senha/);
  const curta = await call("POST", "/students", { ...newStudent, email: "x@teste.com", password: "1234567" });
  assert.equal(curta.status, 400);
});

test("fluxo completo: cadastro, login, reserva e confirmação", async () => {
  const joana = browser();
  const driver = await joana.call("POST", "/drivers", newDriver);
  assert.equal(driver.status, 201);
  assert.equal(driver.body.plate, "ABC-1D23");
  assert.equal(driver.body.passwordHash, undefined);
  assert.match(driver.setCookie!, /rotau_session=.+; .*HttpOnly/i);
  assert.match(driver.setCookie!, /SameSite=Lax/i);

  const rafa = browser();
  const student = await rafa.call("POST", "/students", newStudent);
  assert.equal(student.status, 201);
  assert.equal(student.body.college, "Ufscar");

  const me = await rafa.call("GET", "/auth/me");
  assert.deepEqual(me.body, { profile: "student", id: student.body.id, name: "Rafa" });

  const duplicate = await call("POST", "/students", { ...newStudent, college: "Ufscar" });
  assert.equal(duplicate.status, 409);

  // sai e entra de novo com a senha
  assert.equal((await rafa.call("POST", "/auth/logout", {})).status, 200);
  assert.equal(rafa.cookie, "");
  assert.equal((await rafa.call("GET", "/auth/me")).status, 401);
  assert.equal((await rafa.call("GET", `/students/${student.body.id}`)).status, 401);

  const wrong = await rafa.call("POST", "/auth/login", { profile: "student", email: "rafa@teste.com", password: "errada123" });
  assert.equal(wrong.status, 401);
  const wrongProfile = await rafa.call("POST", "/auth/login", { profile: "driver", email: "rafa@teste.com", password: "rafa-segura" });
  assert.equal(wrongProfile.status, 401);
  const login = await rafa.call("POST", "/auth/login", { profile: "student", email: "RAFA@teste.com", password: "rafa-segura" });
  assert.equal(login.status, 200);
  assert.equal(login.body.id, student.body.id);

  const vans = await rafa.call("GET", "/vans");
  const van = vans.body.find((v: { id: number }) => v.id === driver.body.id);
  assert.equal(van.route, "Votorantim → Ufscar");
  assert.equal(van.freeSeats, 1);

  const booking = await rafa.call("POST", "/bookings", { driverId: driver.body.id });
  assert.equal(booking.status, 201);
  assert.equal(booking.body.status, "Aguardando");

  const again = await rafa.call("POST", "/bookings", { driverId: driver.body.id });
  assert.equal(again.status, 409);

  // estudante não pode confirmar a própria reserva
  assert.equal((await rafa.call("PATCH", `/bookings/${booking.body.id}`, { status: "Confirmado" })).status, 403);

  const confirmed = await joana.call("PATCH", `/bookings/${booking.body.id}`, { status: "Confirmado", pickupTime: "06:50" });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.status, "Confirmado");

  const dashboard = await joana.call("GET", `/drivers/${driver.body.id}/dashboard`);
  assert.equal(dashboard.body.passengers.length, 1);
  assert.equal(dashboard.body.passengers[0].pickupTime, "06:50");
  assert.equal(dashboard.body.driver.freeSeats, 0);
  assert.equal(dashboard.body.mainDestination, "Ufscar");
});

test("cada usuário só acessa os próprios dados", async () => {
  const carlos = browser();
  const login = await carlos.call("POST", "/auth/login", { profile: "driver", email: "carlos@rotau.com", password: DEMO_PASSWORD });
  assert.equal(login.status, 200);
  const carlosId = login.body.id;

  const mariana = browser();
  const marianaLogin = await mariana.call("POST", "/auth/login", { profile: "student", email: "mariana@email.com", password: DEMO_PASSWORD });
  assert.equal(marianaLogin.status, 200);

  // motorista não vê o painel de outro motorista
  const fernanda = browser();
  await fernanda.call("POST", "/auth/login", { profile: "driver", email: "fernanda@rotau.com", password: DEMO_PASSWORD });
  assert.equal((await fernanda.call("GET", `/drivers/${carlosId}/dashboard`)).status, 403);
  assert.equal((await fernanda.call("GET", `/drivers/${carlosId}`)).status, 403);
  assert.equal((await call("GET", `/drivers/${carlosId}/dashboard`)).status, 401);

  // nem confirma reservas da van de outro motorista
  const passengers = (await carlos.call("GET", `/drivers/${carlosId}/dashboard`)).body.passengers;
  const waiting = passengers.find((p: { status: string }) => p.status === "Aguardando");
  assert.equal((await fernanda.call("PATCH", `/bookings/${waiting.bookingId}`, { status: "Cancelado" })).status, 403);
  assert.equal((await call("PATCH", `/bookings/${waiting.bookingId}`, { status: "Cancelado" })).status, 401);

  // estudante não vê dados de outro estudante
  const other = passengers.find((p: { studentId: number }) => p.studentId !== marianaLogin.body.id);
  assert.equal((await mariana.call("GET", `/students/${other.studentId}`)).status, 403);
  assert.equal((await mariana.call("GET", `/vans?studentId=${other.studentId}`)).status, 403);
  assert.equal((await mariana.call("GET", `/students/${marianaLogin.body.id}`)).status, 200);

  // reservar exige login de estudante e usa sempre o estudante logado
  assert.equal((await call("POST", "/bookings", { studentId: other.studentId, driverId: carlosId })).status, 401);
  assert.equal((await carlos.call("POST", "/bookings", { driverId: carlosId })).status, 403);
});

test("cookie de sessão inválido é ignorado", async () => {
  const res = await fetch(`${base}/auth/me`, { headers: { Cookie: "rotau_session=forjado" } });
  assert.equal(res.status, 401);
});

test("bloqueia login depois de muitas tentativas erradas", async () => {
  const b = browser();
  for (let i = 0; i < 10; i++) {
    assert.equal((await b.call("POST", "/auth/login", { profile: "driver", email: "roberto@rotau.com", password: "chute-errado" })).status, 401);
  }
  const blocked = await b.call("POST", "/auth/login", { profile: "driver", email: "roberto@rotau.com", password: DEMO_PASSWORD });
  assert.equal(blocked.status, 429);
});

test("recusa requisições que alteram dados sem JSON (proteção CSRF)", async () => {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "profile=student&email=mariana@email.com&password=x",
  });
  assert.equal(res.status, 415);
});

test("valida campos obrigatórios", async () => {
  const { status, body } = await call("POST", "/students", { name: "Sem dados", password: "12345678" });
  assert.equal(status, 400);
  assert.match(body.error, /obrigatório/);
});

test("painel de administração exige a senha de administrador", async () => {
  assert.equal((await call("GET", "/admin/overview")).status, 401);

  const student = browser();
  await student.call("POST", "/auth/login", { profile: "student", email: "mariana@email.com", password: DEMO_PASSWORD });
  assert.equal((await student.call("GET", "/admin/overview")).status, 403);

  const admin = browser();
  assert.equal((await admin.call("POST", "/admin/login", { password: "errada" })).status, 401);
  assert.equal((await admin.call("POST", "/admin/login", { password: ADMIN_PASSWORD })).status, 200);
  const { status, body } = await admin.call("GET", "/admin/overview");
  assert.equal(status, 200);
  for (const table of ["colleges", "students", "drivers", "bookings", "searches"]) {
    assert.ok(Array.isArray(body[table]), table);
  }
  assert.ok(body.drivers.some((d: { name: string; cities: string }) => d.name === "Carlos Eduardo" && d.cities === "Centro, Sorocaba"));
  assert.ok(!JSON.stringify(body).includes("scrypt"), "não expõe hashes de senha");
  assert.ok(body.bookings.length >= 4);
  assert.ok(body.searches.length >= 1);
});

test("sem ADMIN_PASSWORD o painel fica desativado", async () => {
  const app = createApp(openDatabase(":memory:"), { adminPassword: "" }).listen(0);
  await new Promise((resolve) => app.once("listening", resolve));
  const url = `http://localhost:${(app.address() as AddressInfo).port}/api/admin`;
  const login = await fetch(`${url}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "" }) });
  assert.equal(login.status, 503);
  assert.equal((await fetch(`${url}/overview`)).status, 503);
  app.close();
});

test("com SEED=false o banco ganha as faculdades, mas não as contas de exemplo", async () => {
  process.env.SEED = "false";
  let repo;
  try {
    repo = await openDatabase(":memory:");
  } finally {
    delete process.env.SEED;
  }
  await repo.ensureColleges(); // rodar de novo não duplica
  const colleges = await repo.listColleges();
  assert.deepEqual(colleges.map((c) => c.name).sort(), ["Fatec", "UniFacens", "Ufscar", "Uniso", "Unip"].sort());
  const overview = await repo.adminOverview();
  assert.equal(overview.students.length, 0);
  assert.equal(overview.drivers.length, 0);
});
