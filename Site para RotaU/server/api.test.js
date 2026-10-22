// Testes da API: `pnpm test:api`
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./index.js";
import { openDatabase } from "./db.js";

let server;
let base;

before(async () => {
  server = createApp(openDatabase(":memory:")).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://localhost:${server.address().port}/api`;
});

after(() => server.close());

async function call(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

test("lista as faculdades do seed", async () => {
  const { status, body } = await call("GET", "/colleges");
  assert.equal(status, 200);
  assert.deepEqual(body.map((c) => c.name).sort(), ["Fatec", "UniFacens", "Ufscar", "Uniso", "Unip"].sort());
});

test("busca registra a pesquisa e conta as vans", async () => {
  const { status, body } = await call("POST", "/searches", { address: "Centro, Sorocaba", college: "UniFacens" });
  assert.equal(status, 201);
  assert.equal(body.count, 2);
});

test("fluxo completo: estudante reserva e motorista confirma", async () => {
  const driver = await call("POST", "/drivers", {
    name: "Joana Souza", phone: "(15) 90000-0000", email: "joana@teste.com",
    vanModel: "Iveco Daily", plate: "abc-1d23", capacity: 1, departureTime: "07:10",
    cities: "Votorantim, Sorocaba", colleges: "Ufscar, Nova Faculdade",
  });
  assert.equal(driver.status, 201);
  assert.equal(driver.body.plate, "ABC-1D23");
  assert.deepEqual(driver.body.cities, ["Votorantim", "Sorocaba"]);

  const student = await call("POST", "/students", {
    name: "Rafa", phone: "(15) 91111-1111", email: "rafa@teste.com", address: "Rua A, 10, Votorantim", college: "ufscar",
  });
  assert.equal(student.status, 201);
  assert.equal(student.body.college, "Ufscar");

  const duplicate = await call("POST", "/students", { ...student.body, college: "Ufscar" });
  assert.equal(duplicate.status, 409);

  const vans = await call("GET", `/vans?studentId=${student.body.id}`);
  const van = vans.body.find((v) => v.id === driver.body.id);
  assert.equal(van.route, "Votorantim → Ufscar");
  assert.equal(van.freeSeats, 1);

  const booking = await call("POST", "/bookings", { studentId: student.body.id, driverId: driver.body.id });
  assert.equal(booking.status, 201);
  assert.equal(booking.body.status, "Aguardando");

  const again = await call("POST", "/bookings", { studentId: student.body.id, driverId: driver.body.id });
  assert.equal(again.status, 409);

  const confirmed = await call("PATCH", `/bookings/${booking.body.id}`, { status: "Confirmado", pickupTime: "06:50" });
  assert.equal(confirmed.body.status, "Confirmado");

  const dashboard = await call("GET", `/drivers/${driver.body.id}/dashboard`);
  assert.equal(dashboard.body.passengers.length, 1);
  assert.equal(dashboard.body.passengers[0].pickupTime, "06:50");
  assert.equal(dashboard.body.driver.freeSeats, 0);
  assert.equal(dashboard.body.mainDestination, "Ufscar");
});

test("valida campos obrigatórios", async () => {
  const { status, body } = await call("POST", "/students", { name: "Sem dados" });
  assert.equal(status, 400);
  assert.match(body.error, /obrigatório/);
});
