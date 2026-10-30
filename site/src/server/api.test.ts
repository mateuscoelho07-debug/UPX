// Testes da API: `pnpm test:api`
process.env.GEOCODE = "false"; // os testes não chamam o serviço de mapas
process.env.SUBSCRIPTION = "off"; // a cobrança só liga nos testes de assinatura
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
  // só as contas de demonstração (vans e alunos), mesmo com SEED=false; nenhuma tem senha
  assert.equal(overview.students.length, 55);
  assert.ok(overview.students.every((s) => String(s.email).endsWith(`@${DEMO_VAN_DOMAIN}`) && String(s.name).endsWith("(demo)")));
  assert.equal(overview.drivers.length, 11);
  assert.ok(overview.drivers.every((d) => String(d.email).endsWith(`@${DEMO_VAN_DOMAIN}`)));
  assert.ok(overview.drivers.every((d) => Number(d.occupied) === 5));
  await repo.syncDemoVans(true); // idempotente: não repete alunos
  assert.equal((await repo.adminOverview()).students.length, 55);

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
  assert.equal(depois.body.legs[0].predicted, false);
  assert.equal(depois.body.legs[1].predicted, true); // a volta ainda não saiu: previsão pelo horário programado
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

test("previsão de chegada segue a rota de quem vai hoje e pula quem não vai", async () => {
  const repo = await openDatabase(":memory:");
  const driver = await repo.createDriver({ name: "Rota", phone: "1", email: "rota@teste.com", vanModel: "Van", plate: "ROT-9Z99", departureTime: "06:30", returnTime: "22:40", cities: "Sorocaba (Centro)", colleges: "Fatec" });
  const ids: number[] = [];
  for (const [name, bairro] of [["Primeira", "Vila Hortência"], ["Segunda", "Éden"], ["Terceira", "Itavuvu"]] as const) {
    const student = await repo.createStudent({ name, phone: "1", email: `${name}@teste.com`, address: `Rua ${name}, 10 - ${bairro}`, college: "Fatec" });
    const booking = await repo.createBooking({ studentId: student.id, driverId: driver.id });
    await repo.updateBooking(booking.id, { status: "Confirmado" });
    ids.push(student.id);
  }
  const now = new Date("2026-10-23T09:30:00Z"); // 06:30 em Brasília, sexta-feira
  await repo.setAttendance(ids[0]!, true, now);
  await repo.setAttendance(ids[1]!, false, now); // a segunda não vai: a rota pula o ponto dela
  await repo.setAttendance(ids[2]!, true, now);
  const today = await repo.startRoute(driver.id, "ida", now);
  assert.equal(today.weekday, "Sexta-feira");
  assert.deepEqual([today.going, today.notGoing, today.pending], [2, 1, 0]);
  const primeira = (await repo.studentToday(ids[0]!, now)).legs[0]!;
  const terceira = (await repo.studentToday(ids[2]!, now)).legs[0]!;
  assert.equal(primeira.predicted, false);
  assert.ok(primeira.eta! >= "06:30" && terceira.eta! > primeira.eta!, `${primeira.eta} ${terceira.eta}`);
  assert.ok(primeira.rideMinutes! > terceira.rideMinutes!); // quem embarca primeiro passa mais tempo na van
  assert.equal((await repo.studentToday(ids[1]!, now)).legs[0]!.eta, null);

  const later = new Date("2026-10-24T01:40:00Z"); // 22:40 do mesmo dia em Brasília
  await repo.startRoute(driver.id, "volta", later);
  const voltaPrimeira = (await repo.studentToday(ids[0]!, later)).legs[1]!;
  const voltaTerceira = (await repo.studentToday(ids[2]!, later)).legs[1]!;
  assert.ok(voltaPrimeira.eta! > "22:40" && voltaTerceira.eta! > "22:40");
  assert.ok(voltaPrimeira.eta !== voltaTerceira.eta);
});

test("endereço que não dá para localizar usa o meio da área da van, não zero minutos", async () => {
  const repo = await openDatabase(":memory:");
  const driver = await repo.createDriver({ name: "Rota", phone: "1", email: "rota2@teste.com", vanModel: "Van", plate: "ROT-8Y88", departureTime: "17:00", returnTime: "22:40", cities: "Itu, Salto", colleges: "UniFacens" });
  const student = await repo.createStudent({ name: "Sem Rua", phone: "1", email: "semrua@teste.com", address: "Rua que não achamos, 5", college: "UniFacens" });
  const booking = await repo.createBooking({ studentId: student.id, driverId: driver.id });
  await repo.updateBooking(booking.id, { status: "Confirmado" });
  const now = new Date("2026-10-23T19:00:00Z");
  await repo.setAttendance(student.id, true, now);
  const volta = (await repo.studentToday(student.id, now)).legs[1]!;
  // da UniFacens (Sorocaba) até a área de Itu/Salto são mais de 30 minutos
  assert.ok(volta.rideMinutes! > 30, `${volta.rideMinutes}`);
});

test("locateStudent guarda a posição encontrada e só tenta uma vez", async () => {
  const repo = await openDatabase(":memory:");
  const student = await repo.createStudent({ name: "Geo", phone: "1", email: "geo@teste.com", address: "Av. Exemplo, 100 - Sorocaba", college: "UniFacens" });
  let calls = 0;
  const found = async () => { calls++; return { lat: -23.49, lng: -47.43 }; };
  await repo.locateStudent(student.id, found);
  await repo.locateStudent(student.id, found);
  assert.equal(calls, 1);
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

test("conta antiga com várias reservas ativas é arrumada ao abrir o banco", async () => {
  const { createClient } = await import("@libsql/client");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const file = join(mkdtempSync(join(tmpdir(), "rotau-")), "legado.db");
  const url = `file:${file}`;
  const first = await openDatabase(url);
  const driverA = await first.createDriver({ name: "Van A", phone: "1", email: "a@leg.com", vanModel: "V", plate: "LEG-1A00", cities: "Itu", colleges: "Fatec" });
  const driverB = await first.createDriver({ name: "Van B", phone: "1", email: "b@leg.com", vanModel: "V", plate: "LEG-2B00", cities: "Itu", colleges: "Fatec" });
  const student = await first.createStudent({ name: "Antigo", phone: "1", email: "antigo@leg.com", address: "Rua 1", college: "Fatec", passwordHash: "x" });

  // simula o banco de antes da regra: sem o índice e com duas reservas ativas
  const raw = createClient({ url });
  await raw.execute("DROP INDEX idx_one_active_booking_per_student");
  await raw.execute({ sql: "INSERT INTO bookings (student_id, driver_id, pickup, status, created_at) VALUES (?, ?, 'Rua 1', 'Aguardando', '2026-01-01 10:00:00')", args: [student.id, driverA.id] });
  await raw.execute({ sql: "INSERT INTO bookings (student_id, driver_id, pickup, status, created_at) VALUES (?, ?, 'Rua 1', 'Confirmado', '2026-01-01 09:00:00')", args: [student.id, driverB.id] });
  raw.close();

  const reopened = await openDatabase(url);
  const vans = (await reopened.listVans({ studentId: student.id })).filter((van) => van.booked);
  assert.deepEqual(vans.map((van) => van.driver), ["Van B"]); // a confirmada vence
  assert.equal((await reopened.notifications({ profile: "student", id: student.id })).items[0]!.title, "Uma van por aluno");
  assert.equal((await reopened.notifications({ profile: "driver", id: driverA.id })).items[0]!.title, "Vaga liberada");
  await reopened.ensureOneVanPerStudent(); // rodar de novo não muda nada

  // e o banco passa a barrar uma segunda reserva ativa, mesmo fora da API
  const raw2 = createClient({ url });
  await assert.rejects(raw2.execute({ sql: "INSERT INTO bookings (student_id, driver_id, pickup, status) VALUES (?, ?, 'x', 'Aguardando')", args: [student.id, driverA.id] }), /UNIQUE/);
  raw2.close();
});

test("excluir a própria conta exige a senha e apaga os dados", async () => {
  const motorista = browser();
  const driver = await motorista.call("POST", "/drivers", { ...newDriver, email: "apagar-van@teste.com", plate: "DEL-1A00", colleges: "Unip" });
  const aluno = browser();
  await aluno.call("POST", "/students", { ...newStudent, email: "apagar@teste.com", college: "Unip" });
  const reserva = await aluno.call("POST", "/bookings", { driverId: driver.body.id });
  await motorista.call("PATCH", `/bookings/${reserva.body.id}`, { status: "Confirmado" });
  await aluno.call("PUT", "/attendance/today", { going: true });

  assert.equal((await call("POST", "/account/delete", { password: "rafa-segura" })).status, 401);
  assert.equal((await aluno.call("POST", "/account/delete", { password: "errada123" })).status, 401);
  assert.equal((await aluno.call("POST", "/account/delete", {})).status, 401);
  assert.equal((await aluno.call("GET", "/auth/me")).status, 200); // senha errada não derruba a sessão

  assert.equal((await aluno.call("POST", "/account/delete", { password: "rafa-segura" })).status, 200);
  assert.equal(aluno.cookie, "");
  assert.equal((await aluno.call("GET", "/auth/me")).status, 401);
  assert.equal((await call("POST", "/auth/login", { profile: "student", email: "apagar@teste.com", password: "rafa-segura" })).status, 401);

  // o motorista fica sem o passageiro e é avisado
  const painel = await motorista.call("GET", `/drivers/${driver.body.id}/dashboard`);
  assert.equal(painel.body.passengers.length, 0);
  assert.ok((await motorista.call("GET", "/notifications")).body.items.some((n: { body: string }) => /excluiu a conta/.test(n.body)));

  // motorista também pode excluir; a van some da busca
  assert.equal((await motorista.call("POST", "/account/delete", { password: "joana-segura" })).status, 200);
  const vans = await call("GET", "/vans?college=Unip");
  assert.ok(!vans.body.some((v: { id: number }) => v.id === driver.body.id));
  assert.equal((await motorista.call("GET", `/drivers/${driver.body.id}/dashboard`)).status, 401);
});

test("alunos de demonstração vão todo dia e a rota é calculada pelos endereços", async () => {
  const repo = await openDatabase(":memory:");
  const now = new Date("2026-10-23T19:00:00Z"); // 16:00 em Brasília
  const vans = (await repo.adminOverview()).drivers;
  const sul = vans.find((d) => d.email === `van-sul@${DEMO_VAN_DOMAIN}`)!;
  const painel = await repo.driverDashboard(Number(sul.id), now);
  assert.equal(painel.passengers.length, 5);
  assert.ok(painel.passengers.every((p) => p.going === true));
  const ida = painel.today.legs[0]!;
  assert.equal(ida.scheduled, "17:45");
  assert.equal(ida.predicted, true);
  assert.equal(ida.route!.stops.length, 5);
  assert.deepEqual(ida.route!.stops.map((s) => s.order), [1, 2, 3, 4, 5]);
  assert.ok(ida.route!.stops[0]!.eta! > "17:45");
  const times = ida.route!.stops.map((s) => s.eta!);
  assert.deepEqual(times, [...times].sort()); // a previsão cresce ao longo da rota
  assert.ok(ida.route!.totalMinutes > 0 && ida.route!.distanceKm > 0);
  assert.ok(ida.route!.arrival! > times.at(-1)!);

  // uma aluna nova entra na van e a previsão dela também considera os colegas
  const ana = await repo.createStudent({ name: "Ana", phone: "1", email: "ana@teste.com", address: "Rua Nova, 10 - Campolim, Sorocaba", college: "Fatec" });
  const reserva = await repo.createBooking({ studentId: ana.id, driverId: Number(sul.id) });
  await repo.updateBooking(reserva.id, { status: "Confirmado" });
  assert.equal((await repo.studentToday(ana.id, now)).legs[0]!.eta, null); // ainda não confirmou presença
  await repo.setAttendance(ana.id, true, now);
  const hoje = await repo.studentToday(ana.id, now);
  assert.equal(hoje.van!.goingCount, 6);
  assert.match(hoje.legs[0]!.eta!, /^\d\d:\d\d$/);
  assert.equal(hoje.legs[0]!.predicted, true);
  assert.equal((await repo.driverDashboard(Number(sul.id), now)).today.legs[0]!.route!.stops.length, 6);

  // quem avisa que não vai sai da rota
  await repo.setAttendance(ana.id, false, now);
  assert.equal((await repo.driverDashboard(Number(sul.id), now)).today.legs[0]!.route!.stops.length, 5);

});

test("e-mail de demonstração não serve para criar conta de verdade", async () => {
  const res = await call("POST", "/students", { ...newStudent, email: `fake@${DEMO_VAN_DOMAIN}` });
  assert.equal(res.status, 400);
});

// Liga a cobrança só dentro de um teste
async function withSubscription<T>(fn: () => Promise<T>): Promise<T> {
  process.env.SUBSCRIPTION = "on";
  try {
    return await fn();
  } finally {
    process.env.SUBSCRIPTION = "off";
  }
}

test("assinatura: van sem assinatura em dia some da busca e não recebe reservas", () => withSubscription(async () => {
  const repo = await openDatabase(":memory:");
  const driver = await repo.createDriver({ name: "Novo", phone: "1", email: "novo@teste.com", vanModel: "Van", plate: "NOV-1A11", cities: "Itu", colleges: "Fatec" });
  const student = await repo.createStudent({ name: "Aluno", phone: "1", email: "aluno@teste.com", address: "Rua A - Itu", college: "Fatec" });
  const vansDe = async () => (await repo.listVans({ studentId: student.id })).map((v) => v.id);

  // recém-criada: nunca assinou, então fica oculta (as vans de demonstração continuam visíveis)
  assert.equal(driver.subscriptionActive, false);
  assert.ok(!(await vansDe()).includes(driver.id));
  // 11 vans de demonstração + 2 motoristas de exemplo (Carlos e Fernanda, com assinatura até 2099) atendem a Fatec
  assert.equal((await vansDe()).length, 13);
  assert.equal((await repo.searchRoutes({ address: "Itu", college: "Fatec" })).count, 13);
  await assert.rejects(repo.createBooking({ studentId: student.id, driverId: driver.id }), /não está recebendo novas reservas/);
  await assert.rejects(repo.vanDetail(driver.id, student.id), /não está disponível/);

  // assinar libera a van
  const now = new Date("2026-10-24T15:00:00Z");
  const paga = await repo.subscribe(driver.id, now);
  assert.deepEqual([paga.active, paga.until, paga.daysLeft, paga.price], [true, "2026-11-23", 30, 29.9]);
  assert.ok((await vansDe()).includes(driver.id));
  const reserva = await repo.createBooking({ studentId: student.id, driverId: driver.id });
  assert.equal(reserva.status, "Aguardando");

  // pagar de novo soma 30 dias ao que sobrou
  assert.equal((await repo.subscribe(driver.id, now)).until, "2026-12-23");

  // vencida: some para novos alunos, mas quem já reservou continua vendo a van
  const vencida = await repo.createDriver({ name: "Vencida", phone: "1", email: "vencida@teste.com", vanModel: "Van", plate: "VEN-2B22", cities: "Itu", colleges: "Fatec" });
  await repo.subscribe(vencida.id, new Date("2025-01-10T15:00:00Z"));
  assert.equal((await repo.subscription(vencida.id, now)).active, false);
  assert.equal((await repo.getDriver(vencida.id)).subscriptionActive, false);
  assert.ok(!(await vansDe()).includes(vencida.id));
  assert.equal((await repo.vanDetail(driver.id, student.id)).booked, true);
}));

test("assinatura: avisos no sino perto do vencimento, sem repetir", () => withSubscription(async () => {
  const repo = await openDatabase(":memory:");
  const driver = await repo.createDriver({ name: "Aviso", phone: "1", email: "aviso@teste.com", vanModel: "Van", plate: "AVI-3C33", cities: "Itu", colleges: "Fatec" });
  const user = { profile: "driver" as const, id: driver.id };
  const titulos = async () => (await repo.notifications(user)).items.map((n) => n.title);

  await repo.driverDashboard(driver.id);
  await repo.driverDashboard(driver.id); // abrir de novo não repete
  assert.deepEqual(await titulos(), ["Assine para liberar sua van"]);

  const day = (iso: string) => new Date(`${iso}T15:00:00Z`);
  await repo.subscribe(driver.id, day("2031-10-01")); // vale até 2031-10-31
  await repo.checkSubscriptionNotices(driver.id, day("2031-10-20")); // falta muito: sem aviso
  assert.equal((await titulos()).filter((t) => t === "Assinatura perto de vencer").length, 0);
  await repo.checkSubscriptionNotices(driver.id, day("2031-10-29"));
  await repo.checkSubscriptionNotices(driver.id, day("2031-10-30"));
  assert.equal((await titulos()).filter((t) => t === "Assinatura perto de vencer").length, 1);
  await repo.checkSubscriptionNotices(driver.id, day("2031-11-02"));
  await repo.checkSubscriptionNotices(driver.id, day("2031-11-03"));
  const todos = await repo.notifications(user);
  assert.equal(todos.items.filter((n) => n.title === "Assinatura vencida").length, 1);
  assert.match(todos.items.find((n) => n.title === "Assinatura vencida")!.body, /31\/10\/2031/);

  // renovar zera o controle: o próximo vencimento avisa de novo
  await repo.subscribe(driver.id, day("2031-11-03"));
  assert.equal((await repo.subscription(driver.id, day("2031-11-03"))).active, true);
}));

test("assinatura: rotas da API, simulação e variáveis de ambiente", () => withSubscription(async () => {
  const motorista = browser();
  const criado = await motorista.call("POST", "/drivers", { ...newDriver, email: "assina@teste.com", plate: "ASS-4D44" });
  assert.equal(criado.status, 201);
  assert.equal(criado.body.subscriptionActive, false);
  const id = criado.body.id;

  const antes = await motorista.call("GET", `/drivers/${id}/subscription`);
  assert.deepEqual([antes.body.enabled, antes.body.active, antes.body.until, antes.body.simulated], [true, false, null, true]);
  const painel = await motorista.call("GET", `/drivers/${id}/dashboard`);
  assert.equal(painel.body.subscription.active, false);

  assert.equal((await call("POST", `/drivers/${id}/subscription`)).status, 401);
  const outro = browser();
  await outro.call("POST", "/drivers", { ...newDriver, email: "outro@teste.com", plate: "OUT-5E55" });
  assert.equal((await outro.call("POST", `/drivers/${id}/subscription`)).status, 403);

  const pago = await motorista.call("POST", `/drivers/${id}/subscription`);
  assert.equal(pago.status, 200);
  assert.equal(pago.body.active, true);
  assert.equal(pago.body.daysLeft, 30);

  process.env.SUBSCRIPTION_PRICE = "49,90";
  try {
    assert.equal((await motorista.call("GET", `/drivers/${id}/subscription`)).body.price, 49.9);
    process.env.SUBSCRIPTION_PAYMENT = "stripe";
    assert.equal((await motorista.call("POST", `/drivers/${id}/subscription`)).status, 501);
  } finally {
    delete process.env.SUBSCRIPTION_PRICE;
    delete process.env.SUBSCRIPTION_PAYMENT;
  }

  // com SUBSCRIPTION=off ninguém precisa assinar
  process.env.SUBSCRIPTION = "off";
  assert.equal((await motorista.call("GET", `/drivers/${id}/subscription`)).body.enabled, false);
  assert.equal((await motorista.call("POST", `/drivers/${id}/subscription`)).status, 409);
}));

test("o painel do motorista traz a rota calculada e o navegador não recebe as coordenadas", async () => {
  const repo = await openDatabase(":memory:");
  const norte = (await repo.adminOverview()).drivers.find((d) => d.email === `van-norte@${DEMO_VAN_DOMAIN}`)!;
  const { today, passengers } = await repo.driverDashboard(Number(norte.id), new Date("2026-10-24T19:00:00Z"));
  for (const leg of today.legs) {
    assert.equal(leg.route!.stops.length, 5);
    assert.ok(!("mapsLinks" in leg.route!));
  }
  assert.ok(passengers.every((p) => !("point" in p) && !("mapsQuery" in p)));
});

test("alunos coringa: 3 na van do motorista escolhido, sempre indo, e saem com DEMO_VANS=false", async () => {
  const repo = await openDatabase(":memory:");
  const mateus = await repo.createDriver({ name: "Mateus Coelho", phone: "1", email: "mateus@teste.com", vanModel: "Van", plate: "MAT-1A11", capacity: 10, departureTime: "17:00", cities: "Sorocaba (Centro)", colleges: "UniFacens, Fatec" });
  const outro = await repo.createDriver({ name: "Outro Motorista", phone: "1", email: "outro2@teste.com", vanModel: "Van", plate: "OUT-2B22", capacity: 10, departureTime: "17:00", cities: "Itu", colleges: "Fatec" });

  // ao abrir o painel (ou na próxima partida do servidor) os coringas entram, uma vez só
  await repo.driverDashboard(mateus.id);
  await repo.syncDemoVans(true);
  const now = new Date("2026-10-24T19:00:00Z");
  const painel = await repo.driverDashboard(mateus.id, now);
  assert.equal(painel.passengers.length, 3);
  assert.ok(painel.passengers.every((p) => p.name.endsWith("(coringa)") && p.going === true && p.status === "Confirmado"));
  assert.equal(painel.today.going, 3);
  assert.equal(painel.today.legs[0]!.route!.stops.length, 3);
  assert.equal((await repo.driverDashboard(outro.id, now)).passengers.length, 0); // só o motorista escolhido

  // coringa não tem senha nem aparece como conta de verdade; a van real continua depois de DEMO_VANS=false
  await repo.syncDemoVans(false);
  process.env.DEMO_VANS = "false"; // como na Vercel: com a variável, eles não voltam
  try {
    assert.equal((await repo.getDriver(mateus.id)).name, "Mateus Coelho");
    assert.equal((await repo.driverDashboard(mateus.id, now)).passengers.length, 0);
  } finally {
    delete process.env.DEMO_VANS;
  }
});

test("alunos coringa respeitam as vagas e o CORINGA_DRIVERS", async () => {
  const repo = await openDatabase(":memory:");
  const pequena = await repo.createDriver({ name: "Mateus Coelho", phone: "1", email: "p@teste.com", vanModel: "Van", plate: "PEQ-3C33", capacity: 2, departureTime: "17:00", cities: "Itu", colleges: "Fatec" });
  assert.equal((await repo.driverDashboard(pequena.id)).passengers.length, 2); // só cabem 2

  process.env.CORINGA_DRIVERS = "outra@teste.com";
  try {
    const outra = await repo.createDriver({ name: "Outra Pessoa", phone: "1", email: "outra@teste.com", vanModel: "Van", plate: "OUT-4D44", capacity: 5, departureTime: "17:00", cities: "Itu", colleges: "Fatec" });
    assert.equal((await repo.driverDashboard(outra.id)).passengers.length, 3); // por e-mail
    const nova = await repo.createDriver({ name: "Mateus Coelho", phone: "1", email: "n@teste.com", vanModel: "Van", plate: "NOV-5E55", capacity: 5, departureTime: "17:00", cities: "Itu", colleges: "Fatec" });
    assert.equal((await repo.driverDashboard(nova.id)).passengers.length, 0); // o nome padrão não vale mais
  } finally {
    delete process.env.CORINGA_DRIVERS;
  }
});

test("termos: texto público, PDF e aceite digital do motorista", async () => {
  const pdf = async (cookie: string, query = "") => {
    const res = await fetch(`${base}/terms.pdf${query}`, { headers: cookie ? { Cookie: cookie } : {} });
    return { status: res.status, type: res.headers.get("content-type"), bytes: Buffer.from(await res.arrayBuffer()) };
  };

  const texto = await call("GET", "/terms");
  assert.equal(texto.status, 200);
  assert.ok(texto.body.sections.length >= 5);

  // sem login o PDF sai só com o texto; sem aceite do motorista
  const publico = await pdf("");
  assert.equal(publico.status, 200);
  assert.equal(publico.type, "application/pdf");
  assert.equal(publico.bytes.subarray(0, 5).toString(), "%PDF-");
  assert.equal((await pdf("", "?driverId=1")).status, 401);

  // motorista cria a conta sem aceitar: o painel avisa e o PDF diz que não aceitou
  const joana = browser();
  const driver = await joana.call("POST", "/drivers", { ...newDriver, email: "termos@teste.com", plate: "TER-1A11" });
  assert.equal(driver.status, 201);
  const antes = await joana.call("GET", `/drivers/${driver.body.id}/dashboard`);
  assert.equal(antes.body.terms.accepted, false);
  assert.equal((await pdf(joana.cookie, `?driverId=${driver.body.id}`)).status, 200);

  const aceite = await joana.call("POST", `/drivers/${driver.body.id}/terms-acceptance`);
  assert.equal(aceite.status, 200);
  assert.equal(aceite.body.version, "1.0");
  assert.match(aceite.body.acceptedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  const depois = await joana.call("GET", `/drivers/${driver.body.id}/dashboard`);
  assert.equal(depois.body.terms.accepted, true);

  // aceitar no cadastro
  const marcou = browser();
  const nova = await marcou.call("POST", "/drivers", { ...newDriver, email: "termos2@teste.com", plate: "TER-2B22", acceptTerms: true });
  assert.equal((await marcou.call("GET", `/drivers/${nova.body.id}/dashboard`)).body.terms.accepted, true);

  // quem pode pedir o PDF com o aceite: o próprio motorista e o aluno que reservou nessa van
  assert.equal((await pdf(marcou.cookie, `?driverId=${driver.body.id}`)).status, 403);
  const rafa = browser();
  await rafa.call("POST", "/students", { ...newStudent, email: "aluno-termos@teste.com" });
  assert.equal((await pdf(rafa.cookie, `?driverId=${driver.body.id}`)).status, 403); // ainda sem reserva
  await rafa.call("POST", "/bookings", { driverId: driver.body.id });
  assert.equal((await pdf(rafa.cookie, `?driverId=${driver.body.id}`)).status, 200);
  assert.equal((await pdf(rafa.cookie, `?driverId=${nova.body.id}`)).status, 403);
  assert.equal((await call("POST", `/drivers/${driver.body.id}/terms-acceptance`)).status, 401);
});
