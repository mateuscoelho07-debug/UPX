import assert from "node:assert/strict";
import { test } from "node:test";
import { approximatePoint, collegePoint, placePoint } from "./places.ts";
import { haversineKm, planRoute, roadKm, STOP_MINUTES, travelMinutes } from "./route.ts";
import { clockPlus } from "./time.ts";

test("distância em linha reta entre dois pontos conhecidos", () => {
  // Sorocaba (Centro) -> Votorantim: cerca de 10 km
  const km = haversineKm({ lat: -23.5015, lng: -47.4526 }, { lat: -23.5466, lng: -47.4378 });
  assert.ok(km > 4.5 && km < 6, `${km}`);
  assert.equal(haversineKm({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0);
  assert.ok(roadKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0.1 }) > haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0.1 }));
});

test("tempo de viagem: 30 km/h na cidade, 70 km/h na estrada, com fator de ruas", () => {
  // 0,1 grau na linha do equador = 11,12 km em linha reta, 15 km de ruas:
  // 8 km na cidade (16 min) + 7 km na estrada (6 min)
  const minutes = travelMinutes({ lat: 0, lng: 0 }, { lat: 0, lng: 0.1 });
  assert.ok(Math.abs(minutes - 22.0) < 0.5, `${minutes}`);
  // trecho curto: só velocidade da cidade (3 km de ruas = 6 min)
  const curto = travelMinutes({ lat: 0, lng: 0 }, { lat: 0, lng: 0.02 });
  assert.ok(Math.abs(curto - 6.0) < 0.2, `${curto}`);
});

test("ordena as paradas pelo caminho mais curto e soma o tempo parado", () => {
  const origin = { lat: 0, lng: 0 };
  // três pontos numa linha para leste, fora de ordem na lista
  const stops = [
    { id: 3, point: { lat: 0, lng: 0.09 } },
    { id: 1, point: { lat: 0, lng: 0.03 } },
    { id: 2, point: { lat: 0, lng: 0.06 } },
  ];
  const plan = planRoute(origin, stops);
  assert.deepEqual(plan.stops.map((s) => s.id), [1, 2, 3]);
  assert.deepEqual(plan.stops.map((s) => s.order), [1, 2, 3]);
  const leg = travelMinutes(origin, stops[1]!.point);
  assert.equal(plan.stops[0]!.minutes, Math.round(leg));
  assert.equal(plan.stops[1]!.minutes, Math.round(leg * 2 + STOP_MINUTES));
  assert.equal(plan.stops[2]!.minutes, Math.round(leg * 3 + STOP_MINUTES * 2));
  assert.equal(plan.totalMinutes, Math.round(leg * 3 + STOP_MINUTES * 3));
  assert.ok(Math.abs(plan.distanceKm - roadKm(origin, { lat: 0, lng: 0.09 })) < 0.2);
});

test("na ida a rota termina na faculdade; o último ponto é o mais perto dela", () => {
  const college = { lat: 0, lng: 0.1 };
  const origin = { lat: 0, lng: 0 };
  const plan = planRoute(origin, [{ id: 1, point: { lat: 0, lng: 0.08 } }, { id: 2, point: { lat: 0, lng: 0.02 } }], college);
  assert.deepEqual(plan.stops.map((s) => s.id), [2, 1]);
  const semFaculdade = planRoute(origin, [{ id: 1, point: { lat: 0, lng: 0.08 } }, { id: 2, point: { lat: 0, lng: 0.02 } }]);
  assert.ok(plan.totalMinutes > semFaculdade.totalMinutes);
});

test("o 2-opt desfaz cruzamentos que o vizinho mais próximo deixa", () => {
  const origin = { lat: 0, lng: 0 };
  const points = [
    { id: 1, point: { lat: 0, lng: 0.05 } },
    { id: 2, point: { lat: 0.02, lng: 0.04 } },
    { id: 3, point: { lat: 0.03, lng: 0.09 } },
    { id: 4, point: { lat: -0.02, lng: 0.07 } },
  ];
  const plan = planRoute(origin, points);
  // nenhuma ordem possível é mais curta que a escolhida
  const permutations = (list: typeof points): (typeof points)[] =>
    list.length <= 1 ? [list] : list.flatMap((item, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [item, ...rest]));
  const chosen = plan.stops.map((s) => points.find((p) => p.id === s.id)!);
  for (const order of permutations(points)) {
    // planRoute reordena, então compara o trajeto na ordem escolhida, calculado à mão
    const km = [origin, ...order.map((p) => p.point)].reduce((total, p, i, all) => (i === 0 ? 0 : total + roadKm(all[i - 1]!, p)), 0);
    const best = [origin, ...chosen.map((p) => p.point)].reduce((total, p, i, all) => (i === 0 ? 0 : total + roadKm(all[i - 1]!, p)), 0);
    assert.ok(best <= km + 1e-9);
  }
});

test("endereço sem localização usa um tempo padrão e vai para o fim da rota", () => {
  const plan = planRoute({ lat: 0, lng: 0 }, [{ id: 1, point: null }, { id: 2, point: { lat: 0, lng: 0.03 } }]);
  assert.deepEqual(plan.stops.map((s) => s.id), [2, 1]);
  assert.equal(plan.stops[1]!.minutes, plan.stops[0]!.minutes + STOP_MINUTES + 6);
  const semOrigem = planRoute(null, [{ id: 1, point: { lat: 0, lng: 0 } }]);
  assert.equal(semOrigem.stops[0]!.minutes, 6);
  assert.deepEqual(planRoute(null, []), { stops: [], totalMinutes: 0, distanceKm: 0 });
});

test("endereços digitados são localizados pelo bairro ou cidade", () => {
  assert.deepEqual(placePoint("Rua das Flores, 100 - Vila Hortência, Sorocaba"), placePoint("Vila Hortência"));
  assert.deepEqual(placePoint("av. brasil, 5 - ITU"), placePoint("Itu"));
  assert.deepEqual(placePoint("Jardim Europa"), placePoint("Jd. Europa"));
  assert.equal(placePoint("Rua Qualquer, 1 - Curitiba"), null);
  assert.equal(approximatePoint("Rua Qualquer, 1 - Curitiba"), null);
  // dois endereços no mesmo bairro ficam perto (< 2 km), mas não no mesmo ponto
  const a = approximatePoint("Rua A, 10 - Campolim")!;
  const b = approximatePoint("Rua B, 99 - Campolim")!;
  assert.ok(haversineKm(a, b) > 0 && haversineKm(a, b) < 2);
  assert.deepEqual(approximatePoint("Rua A, 10 - Campolim"), a);
  assert.ok(collegePoint("PUC-SP") && collegePoint("UniFacens") && collegePoint("Inexistente") === null);
});

test("horário mais minutos, inclusive passando da meia-noite", () => {
  assert.equal(clockPlus("17:40", 25), "18:05");
  assert.equal(clockPlus("23:50", 20), "00:10");
  assert.equal(clockPlus("06:30", 0), "06:30");
});
