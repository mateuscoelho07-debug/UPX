// Testes da API: `pnpm test:api`
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "./api.ts";
import { DEMO_PASSWORD, DEMO_VAN_DOMAIN, defaultColleges, openDatabase } from "./db.ts";

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

test("lista as faculdades da região", async () => {
  const { status, body } = await call("GET", "/colleges");
  assert.equal(status, 200);
  assert.deepEqual(body.map((c: { name: string }) => c.name).sort(), [...defaultColleges].sort());
  assert.equal(body.length, 12);
});

test("busca registra a pesquisa e conta as vans", async () => {
  const { status, body } = await call("POST", "/searches", { address: "Centro, Sorocaba", college: "UniFacens" });
  assert.equal(status, 201);
  assert.equal(body.count, 13); // 2 contas de exemplo + 11 vans de demonstração
});

test("vans de demonstração atendem todas as faculdades e não aceitam login", async () => {
  for (const college of defaultColleges) {
    const { body } = await call("GET", `/vans?college=${college}`);
    const demo = body.filter((van: { driver: string }) => van.driver.endsWith("(demo)"));
    assert.equal(demo.length, 11, college);
  }
  const { body } = await call("GET", "/vans?college=UniFacens");
  assert.ok(body.some((van: { route: string }) => van.route === "Sorocaba (Centro) → UniFacens"));
  for (const password of [DEMO_PASSWORD, "qualquer-senha"]) {
    const login = await call("POST", "/auth/login", { profile: "driver", email: `van-centro@${DEMO_VAN_DOMAIN}`, password });
    assert.equal(login.status, 401);
  }
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
  assert.deepEqual(colleges.map((c) => c.name).sort(), [...defaultColleges].sort());
  const overview = await repo.adminOverview();
  assert.equal(overview.students.length, 0);
  // só as vans de demonstração, mesmo com SEED=false
  assert.equal(overview.drivers.length, 11);
  assert.ok(overview.drivers.every((d) => String(d.email).endsWith(`@${DEMO_VAN_DOMAIN}`)));

  // rodar de novo não duplica, e faculdades novas também passam a ser atendidas
  await repo.createDriver({ name: "Real", phone: "1", email: "real@teste.com", vanModel: "Van", plate: "REA-1L00", cities: "Itu", colleges: "Faculdade Nova", passwordHash: "x" });
  await repo.syncDemoVans(true);
  assert.equal((await repo.listVans({ college: "Faculdade Nova" })).length, 12);
  assert.equal((await repo.adminOverview()).drivers.length, 12);

  // DEMO_VANS=false: as vans de demonstração somem, os motoristas reais ficam
  await repo.syncDemoVans(false);
  const left = (await repo.adminOverview()).drivers;
  assert.deepEqual(left.map((d) => d.email), ["real@teste.com"]);
});

test("presença do dia: estudante avisa se vai e motorista e estudante são notificados", async () => {
  const motorista = browser();
  const driver = await motorista.call("POST", "/drivers", {
    ...newDriver, email: "presenca@teste.com", plate: "PRE-5E00", capacity: 5, departureTime: "06:30", returnTime: "22:40", colleges: "Fatec",
  });
  assert.equal(driver.status, 201);
  assert.equal(driver.body.returnTime, "22:40");

  const ana = browser();
  await ana.call("POST", "/students", { ...newStudent, name: "Ana Souza", email: "ana.presenca@teste.com", college: "Fatec", address: "Av. Afonso Vergueiro, 823" });

  // sem reserva não dá para confirmar presença
  const semVan = await ana.call("GET", "/attendance/today");
  assert.equal(semVan.status, 200);
  assert.equal(semVan.body.van, null);
  assert.equal((await ana.call("PUT", "/attendance/today", { going: true })).status, 409);

  const booking = await ana.call("POST", "/bookings", { driverId: driver.body.id });
  await motorista.call("PATCH", `/bookings/${booking.body.id}`, { status: "Confirmado" });

  const antes = await ana.call("GET", "/attendance/today");
  assert.equal(antes.body.going, null);
  assert.equal(antes.body.van.driver, "Joana Souza");
  assert.deepEqual(antes.body.legs.map((l: { leg: string; scheduled: string }) => [l.leg, l.scheduled]), [["ida", "06:30"], ["volta", "22:40"]]);
  assert.equal(antes.body.legs[0].eta, null);

  assert.equal((await ana.call("PUT", "/attendance/today", { going: "sim" })).status, 400);
  const vou = await ana.call("PUT", "/attendance/today", { going: true });
  assert.equal(vou.status, 200);
  assert.equal(vou.body.going, true);
  assert.equal(vou.body.van.goingCount, 1);

  // só estudante marca presença; motorista não
  assert.equal((await motorista.call("PUT", "/attendance/today", { going: true })).status, 403);
  assert.equal((await call("GET", "/attendance/today")).status, 401);

  const painel = await motorista.call("GET", `/drivers/${driver.body.id}/dashboard`);
  assert.equal(painel.body.today.going, 1);
  assert.equal(painel.body.today.pending, 0);
  assert.equal(painel.body.passengers[0].going, true);

  const avisosMotorista = await motorista.call("GET", "/notifications");
  assert.ok(avisosMotorista.body.items.some((n: { title: string }) => n.title === "Ana vai hoje"));
  assert.ok(avisosMotorista.body.items.some((n: { title: string }) => n.title === "Nova reserva"));
  const avisosAna = await ana.call("GET", "/notifications");
  assert.equal(avisosAna.body.items[0].body, "Presença confirmada: você vai hoje. O motorista já sabe.");
  assert.ok(avisosAna.body.items.some((n: { title: string }) => n.title === "Reserva confirmada"));
  assert.equal(avisosAna.body.unread, 2);

  // confirmar de novo não repete o aviso
  await ana.call("PUT", "/attendance/today", { going: true });
  assert.equal((await ana.call("GET", "/notifications")).body.unread, 2);

  assert.equal((await ana.call("POST", "/notifications/read", {})).status, 200);
  assert.equal((await ana.call("GET", "/notifications")).body.unread, 0);

  // motorista inicia a ida: quem vai recebe a previsão; não dá para iniciar duas vezes
  assert.equal((await ana.call("POST", `/drivers/${driver.body.id}/route-runs`, { leg: "ida" })).status, 403);
  assert.equal((await motorista.call("POST", `/drivers/${driver.body.id}/route-runs`, { leg: "ontem" })).status, 400);
  const ida = await motorista.call("POST", `/drivers/${driver.body.id}/route-runs`, { leg: "ida" });
  assert.equal(ida.status, 201);
  assert.match(ida.body.legs[0].startedAt, /^\d\d:\d\d$/);
  assert.equal((await motorista.call("POST", `/drivers/${driver.body.id}/route-runs`, { leg: "ida" })).status, 409);

  const depois = await ana.call("GET", "/attendance/today");
  assert.match(depois.body.legs[0].eta, /^\d\d:\d\d$/);
  assert.equal(depois.body.legs[1].eta, null);
  const saiu = (await ana.call("GET", "/notifications")).body;
  assert.equal(saiu.unread, 1);
  assert.equal(saiu.items[0].title, "A van saiu para te buscar");
  assert.match(saiu.items[0].body, new RegExp(`Previsão no seu ponto \\(Av. Afonso Vergueiro, 823\\): ${depois.body.legs[0].eta}`));

  // não vou: o motorista fica sabendo
  const naoVou = await ana.call("PUT", "/attendance/today", { going: false });
  assert.equal(naoVou.body.going, false);
  assert.equal(naoVou.body.legs[0].eta, null);
  const painel2 = await motorista.call("GET", `/drivers/${driver.body.id}/dashboard`);
  assert.equal(painel2.body.today.notGoing, 1);
  assert.ok((await motorista.call("GET", "/notifications")).body.items.some((n: { title: string }) => n.title === "Ana não vai hoje"));
});

test("previsão de chegada segue a ordem da rota de quem vai hoje", async () => {
  const repo = await openDatabase(":memory:");
  const driver = await repo.createDriver({ name: "Rota", phone: "1", email: "rota@teste.com", vanModel: "Van", plate: "ROT-9Z99", departureTime: "06:30", returnTime: "22:40", cities: "Sorocaba", colleges: "Fatec" });
  const ids: number[] = [];
  for (const [index, name] of ["Primeira", "Segunda", "Terceira"].entries()) {
    const student = await repo.createStudent({ name, phone: "1", email: `${name}@teste.com`, address: `Rua ${name}`, college: "Fatec" });
    const booking = await repo.createBooking({ studentId: student.id, driverId: driver.id });
    await repo.updateBooking(booking.id, { status: "Confirmado", pickupTime: `06:4${index}` });
    ids.push(student.id);
  }
  const now = new Date("2026-10-23T09:30:00Z"); // 06:30 em Brasília, sexta-feira
  await repo.setAttendance(ids[0]!, true, now);
  await repo.setAttendance(ids[1]!, false, now); // a segunda não vai: a rota pula o ponto dela
  await repo.setAttendance(ids[2]!, true, now);
  const today = await repo.startRoute(driver.id, "ida", now);
  assert.equal(today.weekday, "Sexta-feira");
  assert.deepEqual([today.going, today.notGoing, today.pending], [2, 1, 0]);
  assert.equal((await repo.studentToday(ids[0]!, now)).legs[0]!.eta, "06:38");
  assert.equal((await repo.studentToday(ids[2]!, now)).legs[0]!.eta, "06:46");
  assert.equal((await repo.studentToday(ids[1]!, now)).legs[0]!.eta, null);

  // na volta, a ordem se inverte
  const later = new Date("2026-10-24T01:40:00Z"); // 22:40 do mesmo dia em Brasília
  await repo.startRoute(driver.id, "volta", later);
  assert.equal((await repo.studentToday(ids[2]!, later)).legs[1]!.eta, "22:48");
  assert.equal((await repo.studentToday(ids[0]!, later)).legs[1]!.eta, "22:56");
});

test("cada estudante escolhe uma van só: trocar, cancelar e ver os detalhes", async () => {
  const vanA = browser();
  const a = await vanA.call("POST", "/drivers", { ...newDriver, email: "vana@teste.com", plate: "VAN-1A00", capacity: 2, returnTime: "22:30", colleges: "Fatec" });
  const vanB = browser();
  const b = await vanB.call("POST", "/drivers", { ...newDriver, name: "Bruno Lima", email: "vanb@teste.com", plate: "VAN-2B00", capacity: 2, colleges: "Fatec, Unip" });
  const outra = browser();
  const c = await outra.call("POST", "/drivers", { ...newDriver, name: "Carla Dias", email: "vanc@teste.com", plate: "VAN-3C00", colleges: "Unip" });

  const lia = browser();
  await lia.call("POST", "/students", { ...newStudent, name: "Lia Prado", email: "lia@teste.com", college: "Fatec", address: "Rua Lia, 1" });

  // detalhes: só vans da faculdade dela; sem reserva o telefone fica escondido
  assert.equal((await call("GET", `/vans/${a.body.id}`)).status, 401);
  assert.equal((await lia.call("GET", `/vans/${c.body.id}`)).status, 404);
  const antes = await lia.call("GET", `/vans/${a.body.id}`);
  assert.equal(antes.status, 200);
  assert.equal(antes.body.phone, null);
  assert.equal(antes.body.booked, false);
  assert.equal(antes.body.returnTime, "22:30");
  assert.deepEqual(antes.body.cities, ["Votorantim", "Sorocaba"]);
  assert.deepEqual(antes.body.colleges, ["Fatec"]);
  assert.equal(antes.body.current, null);

  const reservaA = await lia.call("POST", "/bookings", { driverId: a.body.id });
  assert.equal(reservaA.status, 201);
  const depois = await lia.call("GET", `/vans/${a.body.id}`);
  assert.equal(depois.body.booked, true);
  assert.equal(depois.body.phone, newDriver.phone);
  assert.equal(depois.body.bookingId, reservaA.body.id);

  // escolher outra van sem trocar é barrado, na API também
  const semTrocar = await lia.call("POST", "/bookings", { driverId: b.body.id });
  assert.equal(semTrocar.status, 409);
  assert.match(semTrocar.body.error, /já escolheu uma van/);
  assert.equal((await lia.call("POST", "/bookings", { driverId: b.body.id, replace: "true" })).status, 409);
  const detalheB = await lia.call("GET", `/vans/${b.body.id}`);
  assert.equal(detalheB.body.phone, null);
  assert.equal(detalheB.body.current.driver, "Joana Souza");

  // trocar: a reserva antiga é cancelada, a nova entra e a van antiga é avisada
  const troca = await lia.call("POST", "/bookings", { driverId: b.body.id, replace: true });
  assert.equal(troca.status, 201);
  const vans = (await lia.call("GET", "/vans")).body;
  assert.deepEqual(vans.filter((v: { booked: boolean }) => v.booked).map((v: { id: number }) => v.id), [b.body.id]);
  assert.equal((await vanA.call("GET", `/drivers/${a.body.id}/dashboard`)).body.passengers.length, 0);
  assert.ok((await vanA.call("GET", "/notifications")).body.items.some((n: { title: string }) => n.title === "Vaga liberada"));

  // presença vale para a van atual
  const hoje = await lia.call("PUT", "/attendance/today", { going: true });
  assert.equal(hoje.body.van.driver, "Bruno Lima");
  assert.equal((await vanB.call("GET", `/drivers/${b.body.id}/dashboard`)).body.today.going, 1);

  // só o próprio estudante cancela; depois disso ele pode escolher outra van
  const outro = browser();
  await outro.call("POST", "/students", { ...newStudent, email: "intruso@teste.com", college: "Fatec" });
  assert.equal((await outro.call("POST", `/bookings/${troca.body.id}/cancel`, {})).status, 403);
  assert.equal((await vanB.call("POST", `/bookings/${troca.body.id}/cancel`, {})).status, 403);
  assert.equal((await lia.call("POST", `/bookings/${troca.body.id}/cancel`, {})).status, 200);
  assert.equal((await lia.call("POST", `/bookings/${troca.body.id}/cancel`, {})).status, 409);
  assert.equal((await lia.call("PUT", "/attendance/today", { going: true })).status, 409);
  assert.equal((await lia.call("GET", "/attendance/today")).body.van, null);

  // o motorista não consegue reviver uma reserva cancelada
  assert.equal((await vanB.call("PATCH", `/bookings/${troca.body.id}`, { status: "Confirmado" })).status, 409);

  assert.equal((await lia.call("POST", "/bookings", { driverId: a.body.id })).status, 201);
  assert.equal((await lia.call("GET", "/attendance/today")).body.van.driver, "Joana Souza");
});
