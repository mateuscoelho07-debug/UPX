import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_WAYPOINTS, mapsLinks } from "./maps.ts";

const params = (url: string) => new URL(url).searchParams;

test("ida: parte da posição do motorista, passa pelos alunos e termina na faculdade", () => {
  const [link, ...resto] = mapsLinks(["-23.50,-47.45", "Rua A, 10 - Itu"], { destination: "Fatec Sorocaba SP" });
  assert.equal(resto.length, 0);
  assert.equal(link!.label, "Abrir no Google Maps");
  const p = params(link!.url);
  assert.equal(p.get("origin"), null); // sem origem, o Maps usa a posição atual
  assert.equal(p.get("destination"), "Fatec Sorocaba SP");
  assert.equal(p.get("waypoints"), "-23.50,-47.45|Rua A, 10 - Itu");
  assert.equal(p.get("travelmode"), "driving");
  assert.ok(link!.url.startsWith("https://www.google.com/maps/dir/?api=1"));
});

test("volta: sai da faculdade e termina no último aluno", () => {
  const [link] = mapsLinks(["a", "b", "c"], { origin: "Fatec Sorocaba SP" });
  const p = params(link!.url);
  assert.equal(p.get("origin"), "Fatec Sorocaba SP");
  assert.equal(p.get("waypoints"), "a|b");
  assert.equal(p.get("destination"), "c");
});

test("passou de 9 paradas: divide em trechos que se encaixam", () => {
  const stops = Array.from({ length: 14 }, (_, i) => `p${i + 1}`);
  const links = mapsLinks(stops, { destination: "Faculdade" });
  assert.equal(links.length, 2); // 15 pontos: 10 + 5
  assert.deepEqual(links.map((l) => l.label), ["Trecho 1 de 2 no Google Maps", "Trecho 2 de 2 no Google Maps"]);
  const [a, b] = links.map((l) => params(l.url));
  assert.equal(a!.get("waypoints")!.split("|").length, MAX_WAYPOINTS);
  assert.equal(a!.get("destination"), "p10");
  assert.equal(b!.get("origin"), "p10"); // o segundo trecho continua de onde o primeiro parou
  assert.equal(b!.get("waypoints"), "p11|p12|p13|p14");
  assert.equal(b!.get("destination"), "Faculdade");
});

test("sem paradas não há rota; uma parada só vira o destino", () => {
  assert.deepEqual(mapsLinks([], {}), []);
  assert.equal(params(mapsLinks(["x"])[0]!.url).get("destination"), "x");
  assert.equal(params(mapsLinks(["x"])[0]!.url).get("waypoints"), null);
});
