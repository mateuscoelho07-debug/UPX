// Camada de acesso ao banco de dados do RotaU.
// Usa o libSQL (compatível com SQLite): um arquivo local em desenvolvimento
// e o Turso (banco gratuito na nuvem) quando o site está publicado.
import { createClient, type Client, type InStatement, type InValue, type Transaction } from "@libsql/client";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ApiError } from "./errors.ts";
import { defaultColleges } from "../shared/colleges.ts";
import { hashPasswordSync, type Profile, type SessionUser } from "./auth.ts";
import { schema } from "./schema.ts";
import { DEMO_COLLEGE, DEMO_DOMAIN, DEMO_PASSWORD, demoDrivers, LEGACY_DEMO_DOMAIN, type DemoPlace } from "./demo.ts";
import { geocode } from "./geocode.ts";
import { approximatePoint, collegePoint, placePoint } from "./places.ts";
import { planRoute, type Point, type RoutePlan } from "./route.ts";
import {
  isSubscriptionActive,
  renewedUntil,
  subscriptionConfig,
  subscriptionInfo,
  type SubscriptionInfo,
} from "./subscription.ts";
import { DOCUMENT_KINDS, documentKind, type DocumentKind, type DocumentMime } from "./documents.ts";
import { TERMS_VERSION, type DriverAcceptance } from "./terms.ts";
import { addMinutes, clockPlus, fromSqlTime, localDay, localTime, weekdayOf } from "./time.ts";

export { DEMO_PASSWORD };

export { ApiError };

export type BookingStatus = "Aguardando" | "Confirmado" | "Cancelado";
const bookingStatuses: BookingStatus[] = ["Aguardando", "Confirmado", "Cancelado"];

export type College = { id: number; name: string };

export type Student = {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  collegeId: number;
  college: string;
};

export type Driver = {
  id: number;
  name: string;
  phone: string;
  email: string;
  vanModel: string;
  plate: string;
  capacity: number;
  departureTime: string;
  returnTime: string | null;
  // endereço de saída da van (casa do motorista): só o próprio motorista vê
  startAddress: string | null;
  rating: number;
  occupied: number;
  freeSeats: number;
  cities: string[];
  colleges: string[];
  subscriptionUntil: string | null;
  // assinatura em dia (ou motorista de demonstração): só assim a van aparece para os alunos
  subscriptionActive: boolean;
  // CNH e CRLV enviados (os alunos veem só este aviso, nunca os arquivos)
  documentsSent: boolean;
};

export type DriverDocument = {
  kind: DocumentKind;
  filename: string;
  mime: DocumentMime;
  size: number;
  uploadedAt: string;
};

export type Van = {
  id: number;
  driver: string;
  vehicle: string;
  route: string;
  time: string;
  returnTime: string | null;
  capacity: number;
  freeSeats: number;
  rating: number;
  booked: boolean;
  documentsSent: boolean;
  // previsão para o estudante logado nesta van, já contando os outros alunos dela (null = sem dados)
  estimate: VanEstimate | null;
  // a van com menos tempo de viagem para o estudante (ida + volta)
  fastest: boolean;
};

// Previsão de um dia de viagem do estudante numa van, já contando os outros alunos dela:
// `pickup` = a van chega na casa dele (entrada na van), `collegeArrival` = chegada na faculdade,
// `homeArrival` = chegada em casa na volta. `pickupMinutes` = minutos da saída da van até a casa dele;
// `homeMinutes` = minutos da faculdade até a casa dele. A van com a menor soma é a "chegada mais rápida".
export type VanEstimate = {
  pickup: string;
  collegeArrival: string;
  homeArrival: string | null;
  pickupMinutes: number;
  homeMinutes: number;
};

// Página da van: tudo o que o estudante precisa para decidir e confirmar presença
export type VanDetail = {
  id: number;
  driver: string;
  vehicle: string;
  plate: string;
  phone: string | null; // só aparece para quem reservou a vaga
  route: string;
  cities: string[];
  colleges: string[];
  time: string;
  returnTime: string | null;
  capacity: number;
  freeSeats: number;
  rating: number;
  booked: boolean;
  documentsSent: boolean;
  bookingId: number | null;
  bookingStatus: BookingStatus | null;
  // van atual do estudante, quando é outra (escolher esta substitui a atual)
  current: { driverId: number; driver: string; bookingId: number } | null;
};

export type Passenger = {
  bookingId: number;
  studentId: number;
  name: string;
  pickup: string;
  pickupTime: string | null;
  college: string;
  status: BookingStatus;
  going: boolean | null;
};

// Passageiro com a posição do endereço (uso interno: não vai para o navegador)
type Rider = Passenger & { point: Point | null };

export type Booking = { id: number; status: BookingStatus; pickup: string; pickupTime: string | null };

export type StudentInput = {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  college?: string | number;
  passwordHash?: string;
};

export type DriverInput = {
  name?: string;
  phone?: string;
  email?: string;
  vanModel?: string;
  plate?: string;
  capacity?: number | string;
  departureTime?: string;
  returnTime?: string | null;
  startAddress?: string | null;
  rating?: number;
  cities?: string | string[];
  colleges?: string | string[];
  passwordHash?: string;
};

type DriverRow = Omit<Driver, "cities" | "colleges" | "freeSeats" | "subscriptionActive" | "documentsSent"> & {
  documentCount: number;
} & { cities: string | null; colleges: string | null };

export type Leg = "ida" | "volta";
export const legs: Leg[] = ["ida", "volta"];

// Uma perna da viagem de hoje: horário programado, quando o motorista saiu e a previsão no ponto do estudante
// `eta` = previsão no ponto do estudante; `predicted` = calculada a partir do horário programado (a van ainda não saiu)
export type TodayLeg = {
  leg: Leg;
  scheduled: string | null;
  startedAt: string | null;
  finishedAt?: string | null; // o motorista finalizou a viagem (chegou na faculdade, ou deixou todos em casa)
  eta: string | null;
  predicted: boolean;
  // minutos que o estudante passa na van nesta viagem (da hora que embarca até a faculdade, ou da faculdade até em casa)
  rideMinutes?: number | null;
};

// Rota calculada pelos endereços: ordem das paradas, tempo e distância
// `legMinutes`/`legKm` = trecho desde o ponto anterior (saída da van ou aluno anterior)
export type RouteStopInfo = {
  studentId: number;
  name: string;
  pickup: string;
  order: number;
  eta: string | null;
  legMinutes: number;
  legKm: number;
};
export type LegRoute = {
  // de onde a van sai: a casa do motorista na ida, a faculdade na volta
  origin: string | null;
  destination: string | null;
  // último trecho: do último aluno até a faculdade (só na ida)
  end: { minutes: number; km: number } | null;
  totalMinutes: number;
  distanceKm: number;
  arrival: string | null;
  stops: RouteStopInfo[];
};

export type StudentToday = {
  day: string;
  weekday: string;
  going: boolean | null;
  van: {
    driverId: number;
    driver: string;
    phone: string;
    vehicle: string;
    pickup: string;
    pickupTime: string | null;
    status: BookingStatus;
    goingCount: number;
  } | null;
  legs: TodayLeg[];
};

export type DriverToday = {
  day: string;
  weekday: string;
  going: number;
  notGoing: number;
  pending: number;
  legs: (TodayLeg & { route: LegRoute | null })[];
};

export type Notification = { id: number; title: string; body: string; createdAt: string; read: boolean };

export type Repository = ReturnType<typeof createRepository>;

// Sem DATABASE_URL, usa um arquivo SQLite local (data/rotau.db na pasta do site, ou DB_PATH).
// Em produção, DATABASE_URL aponta para o banco no Turso (libsql://...) e
// DATABASE_AUTH_TOKEN traz o token de acesso.
export async function openDatabase(
  url = process.env.DATABASE_URL ?? localUrl(process.env.DB_PATH ?? path.resolve("data", "rotau.db")),
  authToken = process.env.DATABASE_AUTH_TOKEN,
): Promise<Repository> {
  if (process.env.VERCEL && !process.env.DATABASE_URL) {
    throw new Error("Defina a variável DATABASE_URL (e DATABASE_AUTH_TOKEN) com os dados do banco no Turso.");
  }
  const db = createClient({ url, authToken });
  await db.executeMultiple(schema);
  await migrate(db);
  const repo = createRepository(db);
  await repo.ensureColleges();
  await repo.ensureOneVanPerStudent();
  await repo.removeOldDrivers();
  await repo.syncDemo(process.env.DEMO_VANS !== "false");
  return repo;
}

// Bancos antigos não têm as colunas novas: senha (login) e horário da volta (presença)
async function migrate(db: Client) {
  const columns: [string, string, string][] = [
    ["students", "password_hash", "TEXT"],
    ["drivers", "password_hash", "TEXT"],
    ["drivers", "return_time", "TEXT"],
    ["students", "lat", "REAL"],
    ["students", "lng", "REAL"],
    ["drivers", "subscription_until", "TEXT"],
    ["drivers", "subscription_notice", "TEXT"],
    ["drivers", "terms_version", "TEXT"],
    ["drivers", "terms_accepted_at", "TEXT"],
    ["drivers", "start_address", "TEXT"],
    ["drivers", "start_lat", "REAL"],
    ["drivers", "start_lng", "REAL"],
    ["route_runs", "finished_at", "TEXT"],
  ];
  // uma consulta por tabela (no Turso cada consulta é uma ida e volta pela internet)
  const existing = new Map<string, Set<unknown>>();
  for (const [table, column, type] of columns) {
    if (!existing.has(table)) {
      const { rows } = await db.execute(`PRAGMA table_info(${table})`);
      existing.set(table, new Set(rows.map((row) => row.name)));
    }
    if (!existing.get(table)!.has(column)) {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
}

// Converte o caminho do arquivo local em URL file:// (formato que o libSQL espera), criando a pasta se preciso
function localUrl(file: string): string {
  mkdirSync(path.dirname(file), { recursive: true });
  return pathToFileURL(file).href;
}

// Lê um campo de texto obrigatório do corpo da requisição
function text(data: Record<string, unknown>, field: string): string {
  const value = data[field];
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new ApiError(400, `O campo "${field}" é obrigatório.`);
  }
  return String(value).trim();
}

// Aceita lista ou texto separado por vírgulas ("Itu, Salto") e devolve itens únicos, sem espaços extras
function splitList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
}

// Contas de demonstração (motoristas e alunos, ver demo.ts) usam o domínio DEMO_DOMAIN; as vans antigas, sem senha,
// usavam LEGACY_DEMO_DOMAIN. Nenhum dos dois serve para criar conta de verdade.
export { DEMO_DOMAIN };

export function isDemoEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return lower.endsWith(`@${DEMO_DOMAIN}`) || lower.endsWith(`@${LEGACY_DEMO_DOMAIN}`);
}

// Limpeza feita uma vez por banco: apaga todos os motoristas cadastrados até aqui (pedido do projeto em
// 2026-11, para todos passarem pelo cadastro novo, com endereço de saída) e os alunos fictícios antigos.
const REMOVE_OLD_DRIVERS = "2026-11-apagar-motoristas";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

// Conexão normal ou uma transação aberta: as duas executam SQL do mesmo jeito
type Executor = Pick<Client, "execute">;

// Repositório: todas as consultas ao banco ficam aqui. A API (api.ts) só chama estes métodos
// e nunca escreve SQL. As funções internas abaixo são auxiliares; o objeto `repo` é a parte pública.
function createRepository(db: Client) {
  // Converte as linhas do libSQL em objetos simples (sem as chaves numéricas)
  async function all<T>(sql: string, args: InValue[] = [], q: Executor = db): Promise<T[]> {
    const { columns, rows } = await q.execute({ sql, args });
    return rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])) as T);
  }

  // Primeira linha do resultado (ou undefined)
  async function get<T>(sql: string, args: InValue[] = [], q: Executor = db): Promise<T | undefined> {
    return (await all<T>(sql, args, q))[0];
  }

  // Executa um comando e devolve o id da linha inserida (quando houver)
  async function run(sql: string, args: InValue[] = [], q: Executor = db): Promise<number> {
    return Number((await q.execute({ sql, args })).lastInsertRowid ?? 0);
  }

  // Executa várias operações como uma só: se qualquer uma falhar, nada é gravado (rollback)
  async function transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const tx = await db.transaction("write");
    try {
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  }

  async function findCollege(nameOrId: string | number, q: Executor = db): Promise<College> {
    const college =
      typeof nameOrId === "number"
        ? await get<College>("SELECT id, name FROM colleges WHERE id = ?", [nameOrId], q)
        : await get<College>("SELECT id, name FROM colleges WHERE name = ?", [nameOrId.trim()], q);
    if (!college) throw new ApiError(400, `Faculdade "${nameOrId}" não encontrada.`);
    return college;
  }

  async function findOrCreateCollege(name: string, q: Executor = db): Promise<College> {
    const existing = await get<College>("SELECT id, name FROM colleges WHERE name = ?", [name], q);
    if (existing) return existing;
    return { id: await run("INSERT INTO colleges (name) VALUES (?)", [name], q), name };
  }

  // INSERT que transforma a violação de UNIQUE (e-mail ou placa repetidos) em erro 409 com mensagem amigável
  async function insertOrConflict(
    sql: string,
    args: InValue[],
    conflictMessage: string,
    q: Executor = db,
  ): Promise<number> {
    try {
      return await run(sql, args, q);
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) throw new ApiError(409, conflictMessage);
      throw error;
    }
  }

  // Consulta base do motorista/van: dados do cadastro mais contagens calculadas na hora
  // (vagas ocupadas, documentos enviados) e as listas de cidades e faculdades em texto.
  const driverSummarySql = `
    SELECT d.id, d.name, d.phone, d.email, d.van_model AS vanModel, d.plate, d.capacity,
           d.departure_time AS departureTime, d.return_time AS returnTime, d.start_address AS startAddress, d.rating, d.subscription_until AS subscriptionUntil,
           (SELECT COUNT(*) FROM bookings b WHERE b.driver_id = d.id AND b.status <> 'Cancelado') AS occupied,
           (SELECT COUNT(*) FROM driver_documents x WHERE x.driver_id = d.id) AS documentCount,
           (SELECT group_concat(city, ',') FROM (SELECT city FROM driver_cities WHERE driver_id = d.id ORDER BY position)) AS cities,
           (SELECT group_concat(c.name, ',') FROM driver_colleges dc JOIN colleges c ON c.id = dc.college_id WHERE dc.driver_id = d.id) AS colleges
    FROM drivers d`;

  // Linha do banco -> objeto Driver: separa as listas, calcula vagas livres e se a assinatura está em dia
  function toDriver({ documentCount, ...row }: DriverRow): Driver {
    return {
      ...row,
      documentsSent: Number(documentCount) >= DOCUMENT_KINDS.length,
      cities: row.cities ? row.cities.split(",") : [],
      colleges: row.colleges ? row.colleges.split(",") : [],
      freeSeats: Math.max(row.capacity - row.occupied, 0),
      subscriptionActive: isSubscriptionActive(row.subscriptionUntil, localDay(new Date()), isDemoEmail(row.email)),
    };
  }

  async function getDriver(id: number, q: Executor = db): Promise<Driver> {
    const row = await get<DriverRow>(`${driverSummarySql} WHERE d.id = ?`, [id], q);
    if (!row) throw new ApiError(404, "Motorista não encontrado.");
    return toDriver(row);
  }

  async function getStudent(id: number, q: Executor = db): Promise<Student> {
    const student = await get<Student>(
      `
      SELECT s.id, s.name, s.phone, s.email, s.address, c.id AS collegeId, c.name AS college
      FROM students s JOIN colleges c ON c.id = s.college_id WHERE s.id = ?`,
      [id],
      q,
    );
    if (!student) throw new ApiError(404, "Estudante não encontrado.");
    return student;
  }

  // Vans visíveis para uma faculdade: só as com assinatura em dia, melhor nota primeiro
  async function driversForCollege(collegeId: number): Promise<Driver[]> {
    const rows = await all<DriverRow>(
      `${driverSummarySql}
      WHERE d.id IN (SELECT driver_id FROM driver_colleges WHERE college_id = ?)
      ORDER BY d.rating DESC, d.departure_time`,
      [collegeId],
    );
    return rows.map(toDriver).filter((driver) => driver.subscriptionActive);
  }

  async function getBooking(id: number): Promise<Booking> {
    const booking = await get<Booking>(
      "SELECT id, status, pickup, pickup_time AS pickupTime FROM bookings WHERE id = ?",
      [id],
    );
    if (!booking) throw new ApiError(404, "Reserva não encontrada.");
    return booking;
  }

  // Cria um aviso para o sino do painel
  async function notify(user: SessionUser, title: string, body: string, q: Executor = db): Promise<void> {
    await run(
      "INSERT INTO notifications (profile, user_id, title, body) VALUES (?, ?, ?, ?)",
      [user.profile, user.id, title, body],
      q,
    );
  }

  // Reserva que vale para o estudante: a confirmada, ou a mais recente aguardando
  function activeBooking(studentId: number) {
    return get<{ id: number; driverId: number; pickup: string; pickupTime: string | null; status: BookingStatus }>(
      `
      SELECT id, driver_id AS driverId, pickup, pickup_time AS pickupTime, status FROM bookings
      WHERE student_id = ? AND status <> 'Cancelado'
      ORDER BY status = 'Confirmado' DESC, created_at DESC, id DESC LIMIT 1`,
      [studentId],
    );
  }

  // Passageiros da van com a presença do dia (null = ainda não respondeu). Os alunos fictícios de demonstração
  // (aluno...@rotau.test) vão todo dia, a menos que a presença deles seja registrada; o EstudanteUpx responde. `point` = posição do endereço, se conhecida.
  async function passengersOf(driverId: number, day: string): Promise<Rider[]> {
    const rows = await all<
      Omit<Passenger, "going"> & { going: number | null; lat: number | null; lng: number | null; home: string }
    >(
      `
      SELECT b.id AS bookingId, s.id AS studentId, s.name, b.pickup, b.pickup_time AS pickupTime, c.name AS college, b.status,
             s.lat, s.lng, s.address AS home,
             coalesce((SELECT a.going FROM attendance a WHERE a.student_id = s.id AND a.driver_id = b.driver_id AND a.day = ?),
                      CASE WHEN s.email LIKE ? THEN 1 END) AS going
      FROM bookings b
      JOIN students s ON s.id = b.student_id
      JOIN colleges c ON c.id = s.college_id
      WHERE b.driver_id = ? AND b.status <> 'Cancelado'
      ORDER BY coalesce(b.pickup_time, '99:99'), b.created_at, b.id`,
      [day, `aluno%@${DEMO_DOMAIN}`, driverId],
    );
    return rows.map(({ lat, lng, home, going, ...row }) => ({
      ...row,
      going: going === null ? null : Boolean(going),
      point: lat !== null && lng !== null ? { lat, lng } : (approximatePoint(row.pickup) ?? approximatePoint(home)),
    }));
  }

  // Quando o motorista iniciou (e, se já chegou, finalizou) a ida e/ou a volta no dia
  type Run = { started: Date; finished: Date | null };
  async function routeRuns(driverId: number, day: string): Promise<Partial<Record<Leg, Run>>> {
    const rows = await all<{ leg: Leg; startedAt: string; finishedAt: string | null }>(
      "SELECT leg, started_at AS startedAt, finished_at AS finishedAt FROM route_runs WHERE driver_id = ? AND day = ?",
      [driverId, day],
    );
    return Object.fromEntries(
      rows.map((row) => [
        row.leg,
        { started: fromSqlTime(row.startedAt), finished: row.finishedAt ? fromSqlTime(row.finishedAt) : null },
      ]),
    );
  }

  // Ponto de saída da van na ida: a casa do motorista (posição achada no mapa ou aproximada pelo endereço);
  // motorista antigo, sem endereço de saída, sai da primeira cidade da rota
  async function startPoint(driver: Driver): Promise<Point | null> {
    const row = await get<{ lat: number | null; lng: number | null }>(
      "SELECT start_lat AS lat, start_lng AS lng FROM drivers WHERE id = ?",
      [driver.id],
    );
    if (row && row.lat !== null && row.lng !== null) return { lat: row.lat, lng: row.lng };
    const approximate = driver.startAddress ? approximatePoint(driver.startAddress) : null;
    return approximate ?? driver.cities.map((city) => placePoint(city)).find((point) => point !== null) ?? null;
  }

  function scheduledTime(driver: Driver, leg: Leg): string | null {
    return leg === "ida" ? driver.departureTime : driver.returnTime;
  }

  // Rota de uma viagem com quem vai hoje, calculada pelos endereços (ver route.ts).
  // Ida: sai da casa do motorista (`start`), pega os estudantes e termina na faculdade.
  // Volta: sai da faculdade e deixa cada estudante em casa.
  // `destination`: faculdade escolhida; sem ela, a da maioria dos estudantes.
  function planLeg(
    driver: Driver,
    leg: Leg,
    riders: Rider[],
    start: Point | null,
    destination: string | null = null,
  ): { plan: RoutePlan; destination: string | null } | null {
    if (riders.length === 0) return null;
    const counts = new Map<string, number>();
    for (const rider of riders) counts.set(rider.college, (counts.get(rider.college) ?? 0) + 1);
    destination ??= [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? driver.colleges[0] ?? null;
    const college: Point | null = destination ? collegePoint(destination) : null;
    const cityPoints = driver.cities.map((city) => placePoint(city)).filter((point): point is Point => point !== null);
    // endereço que não conseguimos localizar: assume um ponto no meio da área que a van atende
    const area: Point | null =
      cityPoints.length === 0
        ? null
        : {
            lat: cityPoints.reduce((t, p) => t + p.lat, 0) / cityPoints.length,
            lng: cityPoints.reduce((t, p) => t + p.lng, 0) / cityPoints.length,
          };
    const stops = riders.map((rider) => ({ id: rider.studentId, point: rider.point ?? area ?? start }));
    const plan = leg === "ida" ? planRoute(start, stops, college) : planRoute(college, stops);
    return { plan, destination };
  }

  // Horário (HH:MM) em que a van chega a um ponto da rota: conta a partir da saída real
  // ou, se ainda não saiu, do horário programado (previsão).
  function clockAt(
    started: Date | undefined,
    scheduled: string | null,
    minutes: number,
  ): { time: string; predicted: boolean } | null {
    if (started) return { time: localTime(addMinutes(started, minutes)), predicted: false };
    return scheduled ? { time: clockPlus(scheduled, minutes), predicted: true } : null;
  }

  // Estudantes cujo endereço já tentamos localizar nesta execução do servidor
  // (evita consultar o serviço de mapas toda vez que o painel abre)
  const triedLocating = new Set<number>();
  const triedLocatingDriver = new Set<number>();

  // O estudante como mais uma parada da rota (posição achada no mapa ou aproximada pelo endereço)
  async function studentAsRider(student: Student): Promise<Rider> {
    const row = (await get<{ lat: number | null; lng: number | null }>("SELECT lat, lng FROM students WHERE id = ?", [
      student.id,
    ]))!;
    return {
      bookingId: 0,
      studentId: student.id,
      name: student.name,
      pickup: student.address,
      pickupTime: null,
      college: student.college,
      status: "Confirmado",
      going: true,
      point: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : approximatePoint(student.address),
    };
  }

  // Previsão do dia do estudante nesta van (ver VanEstimate), contando todos os passageiros dela, respondendo
  // ou não à presença de hoje, porque serve para comparar vans. A ida sai da casa do motorista e a volta, da faculdade.
  async function estimateFor(driver: Driver, me: Rider, college: string): Promise<VanEstimate | null> {
    const riders = (await passengersOf(driver.id, localDay(new Date()))).filter((r) => r.studentId !== me.studentId);
    const everyone = [...riders, me];
    const start = await startPoint(driver);
    const ida = planLeg(driver, "ida", everyone, start, college);
    const volta = planLeg(driver, "volta", everyone, start, college);
    const pickupMinutes = ida?.plan.stops.find((stop) => stop.id === me.studentId)?.minutes;
    const dropMinutes = volta?.plan.stops.find((stop) => stop.id === me.studentId)?.minutes;
    if (!ida || pickupMinutes === undefined || dropMinutes === undefined) return null;
    return {
      pickup: clockPlus(driver.departureTime, pickupMinutes),
      collegeArrival: clockPlus(driver.departureTime, ida.plan.totalMinutes),
      homeArrival: driver.returnTime ? clockPlus(driver.returnTime, dropMinutes) : null,
      pickupMinutes,
      homeMinutes: dropMinutes,
    };
  }

  const repo = {
    listColleges(): Promise<College[]> {
      return all<College>("SELECT id, name FROM colleges ORDER BY name");
    },

    async createStudent(data: StudentInput): Promise<Student> {
      const input = data as Record<string, unknown>;
      const college = await findCollege(typeof data.college === "number" ? data.college : text(input, "college"));
      const id = await insertOrConflict(
        "INSERT INTO students (name, phone, email, address, college_id, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
        [
          text(input, "name"),
          text(input, "phone"),
          text(input, "email"),
          text(input, "address"),
          college.id,
          data.passwordHash ?? null,
        ],
        "Já existe um estudante com este e-mail.",
      );
      return getStudent(id);
    },

    getStudent: (id: number) => getStudent(id),

    async createDriver(data: DriverInput): Promise<Driver> {
      const input = data as Record<string, unknown>;
      const fields = {
        name: text(input, "name"),
        phone: text(input, "phone"),
        email: text(input, "email"),
        vanModel: text(input, "vanModel"),
        plate: text(input, "plate").toUpperCase(),
      };
      const cities = splitList(data.cities);
      const colleges = splitList(data.colleges);
      if (cities.length === 0) throw new ApiError(400, "Informe ao menos uma cidade.");
      if (colleges.length === 0) throw new ApiError(400, "Informe ao menos uma faculdade.");
      const capacity = Number(data.capacity ?? 12);
      if (!Number.isInteger(capacity) || capacity <= 0) throw new ApiError(400, "Número de lugares inválido.");
      const departureTime = String(data.departureTime ?? "17:30");
      if (!timePattern.test(departureTime)) throw new ApiError(400, "Horário de saída inválido (use HH:MM).");
      const returnTime = data.returnTime ? String(data.returnTime) : null;
      if (returnTime && !timePattern.test(returnTime))
        throw new ApiError(400, "Horário de volta inválido (use HH:MM).");
      const startAddress = data.startAddress ? String(data.startAddress).trim() || null : null;
      const rating = data.rating === undefined ? 5 : Number(data.rating);
      if (!(rating >= 0 && rating <= 5)) throw new ApiError(400, "Nota inválida (use de 0 a 5).");

      const id = await transaction(async (tx) => {
        const driverId = await insertOrConflict(
          `INSERT INTO drivers (name, phone, email, van_model, plate, capacity, departure_time, return_time, start_address,
                                rating, password_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            fields.name,
            fields.phone,
            fields.email,
            fields.vanModel,
            fields.plate,
            capacity,
            departureTime,
            returnTime,
            startAddress,
            rating,
            data.passwordHash ?? null,
          ],
          "Já existe um motorista com este e-mail ou placa.",
          tx,
        );
        for (const [index, city] of cities.entries()) {
          await run(
            "INSERT INTO driver_cities (driver_id, position, city) VALUES (?, ?, ?)",
            [driverId, index, city],
            tx,
          );
        }
        for (const name of colleges) {
          const college = await findOrCreateCollege(name, tx);
          await run(
            "INSERT OR IGNORE INTO driver_colleges (driver_id, college_id) VALUES (?, ?)",
            [driverId, college.id],
            tx,
          );
        }
        return driverId;
      });
      return getDriver(id);
    },

    getDriver: (id: number) => getDriver(id),

    // "Meu perfil": o motorista altera telefone, van, horários, cidades e o endereço de saída.
    // Nome, e-mail e placa ficam como no cadastro. Mudou o endereço de saída: a posição é calculada de novo.
    async updateDriverProfile(driverId: number, data: Record<string, unknown>): Promise<Driver> {
      const current = await getDriver(driverId);
      const sets: string[] = [];
      const args: InValue[] = [];
      const set = (column: string, value: InValue) => {
        sets.push(`${column} = ?`);
        args.push(value);
      };
      if (data.phone !== undefined) set("phone", text(data, "phone"));
      if (data.vanModel !== undefined) set("van_model", text(data, "vanModel"));
      if (data.departureTime !== undefined) {
        const value = String(data.departureTime);
        if (!timePattern.test(value)) throw new ApiError(400, "Horário de saída inválido (use HH:MM).");
        set("departure_time", value);
      }
      if (data.returnTime !== undefined) {
        const value = data.returnTime ? String(data.returnTime) : null;
        if (value && !timePattern.test(value)) throw new ApiError(400, "Horário de volta inválido (use HH:MM).");
        set("return_time", value);
      }
      let cities: string[] | null = null;
      if (data.cities !== undefined) {
        cities = splitList(data.cities);
        if (cities.length === 0) throw new ApiError(400, "Informe ao menos uma cidade.");
      }
      if (data.startAddress !== undefined) {
        const address = text(data, "startAddress");
        if (address !== current.startAddress) {
          set("start_address", address);
          set("start_lat", null);
          set("start_lng", null);
          triedLocatingDriver.delete(driverId);
        }
      }
      await transaction(async (tx) => {
        if (sets.length > 0) await run(`UPDATE drivers SET ${sets.join(", ")} WHERE id = ?`, [...args, driverId], tx);
        if (cities) {
          await run("DELETE FROM driver_cities WHERE driver_id = ?", [driverId], tx);
          for (const [index, city] of cities.entries()) {
            await run(
              "INSERT INTO driver_cities (driver_id, position, city) VALUES (?, ?, ?)",
              [driverId, index, city],
              tx,
            );
          }
        }
      });
      return getDriver(driverId);
    },

    // Descobre a posição do endereço de saída da van (uma tentativa por execução do servidor)
    async locateDriver(driverId: number, locate: (address: string) => Promise<Point | null> = geocode): Promise<void> {
      if (triedLocatingDriver.has(driverId)) return;
      const row = await get<{ lat: number | null; address: string | null }>(
        "SELECT start_lat AS lat, start_address AS address FROM drivers WHERE id = ?",
        [driverId],
      );
      if (!row || row.lat !== null || !row.address) return;
      triedLocatingDriver.add(driverId);
      const point = await locate(row.address);
      if (point)
        await run("UPDATE drivers SET start_lat = ?, start_lng = ? WHERE id = ?", [point.lat, point.lng, driverId]);
    },

    // Busca da página inicial: quantas vans atendem a faculdade escolhida
    async searchRoutes(data: { address?: string; college?: string }): Promise<{ college: string; count: number }> {
      const input = data as Record<string, unknown>;
      const address = text(input, "address");
      const found = await findCollege(text(input, "college"));
      const drivers = await driversForCollege(found.id);
      await run("INSERT INTO searches (address, college_id, results) VALUES (?, ?, ?)", [
        address,
        found.id,
        drivers.length,
      ]);
      return { college: found.name, count: drivers.length };
    },

    // Vans disponíveis para um estudante (ou para uma faculdade)
    async listVans({ studentId, college }: { studentId?: number; college?: string }): Promise<Van[]> {
      let target: College | undefined;
      let bookedDriverIds = new Set<number>();
      let me: Rider | null = null;
      if (studentId) {
        const student = await getStudent(studentId);
        me = await studentAsRider(student);
        target = { id: student.collegeId, name: student.college };
        const booked = await all<{ driver_id: number }>(
          "SELECT driver_id FROM bookings WHERE student_id = ? AND status <> 'Cancelado'",
          [studentId],
        );
        bookedDriverIds = new Set(booked.map((row) => row.driver_id));
      } else if (college) {
        target = await findCollege(college);
      }
      const drivers = target
        ? await driversForCollege(target.id)
        : (await all<DriverRow>(`${driverSummarySql} ORDER BY d.rating DESC`))
            .map(toDriver)
            .filter((driver) => driver.subscriptionActive);
      const vans: Van[] = [];
      for (const driver of drivers) {
        vans.push({
          id: driver.id,
          driver: driver.name,
          vehicle: `${driver.vanModel} • ${driver.capacity} lugares`,
          route: `${driver.cities[0] ?? "—"} → ${target?.name ?? driver.colleges[0] ?? "—"}`,
          time: driver.departureTime,
          returnTime: driver.returnTime,
          capacity: driver.capacity,
          freeSeats: driver.freeSeats,
          rating: driver.rating,
          booked: bookedDriverIds.has(driver.id),
          documentsSent: driver.documentsSent,
          estimate: me && target ? await estimateFor(driver, me, target.name) : null,
          fastest: false,
        });
      }
      // Com a previsão, a van que chega mais rápido na casa do estudante e o deixa em casa mais rápido
      // (menor soma, entre as que têm vaga ou já são dele) vem primeiro e fica em destaque; as outras seguem
      // da mais rápida para a mais lenta
      const minutes = (van: Van) =>
        van.estimate ? van.estimate.pickupMinutes + van.estimate.homeMinutes : Number.POSITIVE_INFINITY;
      const timed = vans.filter((van) => van.estimate && (van.freeSeats > 0 || van.booked));
      if (timed.length > 0) {
        timed.reduce((a, b) => (minutes(b) < minutes(a) ? b : a)).fastest = true;
        vans.sort((a, b) => Number(b.fastest) - Number(a.fastest) || minutes(a) - minutes(b));
      }
      return vans;
    },

    // Detalhes de uma van para o estudante logado (o telefone só aparece depois da reserva)
    async vanDetail(driverId: number, studentId: number): Promise<VanDetail> {
      const student = await getStudent(studentId);
      const driver = await getDriver(driverId);
      if (!driver.colleges.some((name) => name.toLowerCase() === student.college.toLowerCase())) {
        throw new ApiError(404, "Esta van não atende a sua faculdade.");
      }
      const active = await all<{ id: number; driverId: number; status: BookingStatus; driver: string }>(
        `
        SELECT b.id, b.driver_id AS driverId, b.status, d.name AS driver FROM bookings b JOIN drivers d ON d.id = b.driver_id
        WHERE b.student_id = ? AND b.status <> 'Cancelado' ORDER BY b.id DESC`,
        [studentId],
      );
      const mine = active.find((booking) => booking.driverId === driverId);
      // van com a assinatura vencida some para quem ainda não reservou
      if (!driver.subscriptionActive && !mine) throw new ApiError(404, "Esta van não está disponível no momento.");
      const other = active.find((booking) => booking.driverId !== driverId);
      return {
        id: driver.id,
        driver: driver.name,
        vehicle: `${driver.vanModel} • ${driver.capacity} lugares`,
        plate: driver.plate,
        phone: mine ? driver.phone : null,
        route: `${driver.cities[0] ?? "—"} → ${student.college}`,
        cities: driver.cities,
        colleges: driver.colleges,
        time: driver.departureTime,
        returnTime: driver.returnTime,
        capacity: driver.capacity,
        freeSeats: driver.freeSeats,
        rating: driver.rating,
        booked: Boolean(mine),
        documentsSent: driver.documentsSent,
        bookingId: mine?.id ?? null,
        bookingStatus: mine?.status ?? null,
        current: !mine && other ? { driverId: other.driverId, driver: other.driver, bookingId: other.id } : null,
      };
    },

    // Estudante desiste da própria vaga
    async cancelBooking(studentId: number, bookingId: number): Promise<{ id: number; status: BookingStatus }> {
      return transaction(async (tx) => {
        const booking = await get<{ studentId: number; driverId: number; status: BookingStatus }>(
          "SELECT student_id AS studentId, driver_id AS driverId, status FROM bookings WHERE id = ?",
          [bookingId],
          tx,
        );
        if (!booking) throw new ApiError(404, "Reserva não encontrada.");
        if (booking.studentId !== studentId)
          throw new ApiError(403, "Você não tem permissão para acessar estes dados.");
        if (booking.status === "Cancelado") throw new ApiError(409, "Esta reserva já foi cancelada.");
        await run("UPDATE bookings SET status = 'Cancelado' WHERE id = ?", [bookingId], tx);
        const student = await getStudent(studentId, tx);
        await notify(
          { profile: "driver", id: booking.driverId },
          "Vaga liberada",
          `${student.name} cancelou a reserva e saiu da sua van.`,
          tx,
        );
        return { id: bookingId, status: "Cancelado" as const };
      });
    },

    // Situação da assinatura do motorista (validade, valor e se a van está liberada para os alunos)
    async subscription(driverId: number, now = new Date()): Promise<SubscriptionInfo> {
      const driver = await getDriver(driverId);
      return subscriptionInfo(driver.subscriptionUntil, localDay(now), isDemoEmail(driver.email));
    },

    // Pagamento SIMULADO: renova a assinatura sem cobrar. A integração real (Stripe, Mercado Pago...)
    // entra no lugar deste método, confirmando o pagamento antes de chamar a mesma renovação.
    async subscribe(driverId: number, now = new Date()): Promise<SubscriptionInfo> {
      const config = subscriptionConfig();
      if (!config.enabled) throw new ApiError(409, "A assinatura não está sendo cobrada.");
      if (!config.simulated) throw new ApiError(501, "O pagamento online ainda não está disponível.");
      const driver = await getDriver(driverId);
      if (isDemoEmail(driver.email)) throw new ApiError(409, "Contas de demonstração não precisam de assinatura.");
      const until = renewedUntil(driver.subscriptionUntil, localDay(now), config.days);
      await run("UPDATE drivers SET subscription_until = ?, subscription_notice = NULL WHERE id = ?", [
        until,
        driverId,
      ]);
      await notify(
        { profile: "driver", id: driverId },
        "Assinatura ativa",
        `Pagamento simulado confirmado. Sua van está liberada para os alunos até ${until.split("-").reverse().join("/")}.`,
      );
      return repo.subscription(driverId, now);
    },

    // Avisa o motorista perto do vencimento e quando venceu (uma vez por validade)
    async checkSubscriptionNotices(driverId: number, now = new Date()): Promise<void> {
      const config = subscriptionConfig();
      const row = await get<{ email: string; until: string | null; notice: string | null }>(
        "SELECT email, subscription_until AS until, subscription_notice AS notice FROM drivers WHERE id = ?",
        [driverId],
      );
      if (!config.enabled || !row || isDemoEmail(row.email)) return;
      const info = subscriptionInfo(row.until, localDay(now), false, config);
      const price = `R$ ${config.price.toFixed(2).replace(".", ",")}`;
      let notice: string | null = null;
      if (row.until === null) {
        notice = "none";
        if (row.notice !== notice) {
          await notify(
            { profile: "driver", id: driverId },
            "Assine para liberar sua van",
            `Sua conta está criada, mas sua van só aparece para os alunos com a assinatura em dia (${price} por mês). Assine no painel.`,
          );
        }
      } else if (!info.active) {
        notice = `${row.until}:expired`;
        if (row.notice !== notice) {
          await notify(
            { profile: "driver", id: driverId },
            "Assinatura vencida",
            `Sua assinatura venceu em ${row.until.split("-").reverse().join("/")} e sua van ficou oculta para novos alunos. Renove no painel.`,
          );
        }
      } else if (info.daysLeft !== null && info.daysLeft <= config.warnDays) {
        notice = `${row.until}:soon`;
        if (row.notice !== notice) {
          await notify(
            { profile: "driver", id: driverId },
            "Assinatura perto de vencer",
            info.daysLeft === 0
              ? "Sua assinatura vence hoje. Renove no painel para não perder novos alunos."
              : `Sua assinatura vence em ${info.daysLeft} ${info.daysLeft === 1 ? "dia" : "dias"}. Renove no painel para não perder novos alunos.`,
          );
        }
      }
      if (notice !== null && notice !== row.notice)
        await run("UPDATE drivers SET subscription_notice = ? WHERE id = ?", [notice, driverId]);
    },

    // Documentos do motorista (RF011): a lista traz só nome, tipo e tamanho; o conteúdo sai apenas em getDocument
    async listDocuments(driverId: number): Promise<DriverDocument[]> {
      return all<DriverDocument>(
        "SELECT kind, filename, mime, size, uploaded_at AS uploadedAt FROM driver_documents WHERE driver_id = ? ORDER BY kind",
        [driverId],
      );
    },

    async saveDocument(
      driverId: number,
      kind: DocumentKind,
      file: { filename: string; mime: DocumentMime; bytes: Buffer },
    ): Promise<DriverDocument[]> {
      await getDriver(driverId);
      await run(
        `
        INSERT INTO driver_documents (driver_id, kind, filename, mime, size, content) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (driver_id, kind) DO UPDATE SET filename = excluded.filename, mime = excluded.mime, size = excluded.size,
          content = excluded.content, uploaded_at = datetime('now')`,
        [driverId, kind, file.filename, file.mime, file.bytes.length, new Uint8Array(file.bytes)],
      );
      return repo.listDocuments(driverId);
    },

    async getDocument(
      driverId: number,
      kind: DocumentKind,
    ): Promise<{ filename: string; mime: DocumentMime; bytes: Buffer }> {
      const row = await get<{ filename: string; mime: DocumentMime; content: ArrayBuffer }>(
        "SELECT filename, mime, content FROM driver_documents WHERE driver_id = ? AND kind = ?",
        [driverId, documentKind(kind)],
      );
      if (!row) throw new ApiError(404, "Documento não enviado.");
      return { filename: row.filename, mime: row.mime, bytes: Buffer.from(row.content) };
    },

    async deleteDocument(driverId: number, kind: DocumentKind): Promise<DriverDocument[]> {
      await run("DELETE FROM driver_documents WHERE driver_id = ? AND kind = ?", [driverId, documentKind(kind)]);
      return repo.listDocuments(driverId);
    },

    // Aceite dos termos de segurança e conduta (RF010)
    async termsAcceptance(driverId: number): Promise<DriverAcceptance> {
      const row = await get<{
        id: number;
        name: string;
        email: string;
        version: string | null;
        acceptedAt: string | null;
      }>(
        "SELECT id, name, email, terms_version AS version, terms_accepted_at AS acceptedAt FROM drivers WHERE id = ?",
        [driverId],
      );
      if (!row) throw new ApiError(404, "Motorista não encontrado.");
      return row;
    },

    async acceptTerms(driverId: number): Promise<DriverAcceptance> {
      await repo.termsAcceptance(driverId);
      await run("UPDATE drivers SET terms_version = ?, terms_accepted_at = datetime('now') WHERE id = ?", [
        TERMS_VERSION,
        driverId,
      ]);
      return repo.termsAcceptance(driverId);
    },

    // Estudante com reserva ativa pode baixar o PDF com o aceite do motorista da van dele
    async studentDriverId(studentId: number): Promise<number | null> {
      return (await activeBooking(studentId))?.driverId ?? null;
    },

    // Painel do motorista: dados da rota, lista de embarque e quem vai hoje
    async driverDashboard(
      driverId: number,
      now = new Date(),
    ): Promise<{
      driver: Driver;
      passengers: Passenger[];
      mainDestination: string;
      today: DriverToday;
      subscription: SubscriptionInfo;
      documents: DriverDocument[];
      terms: { version: string; acceptedVersion: string | null; acceptedAt: string | null; accepted: boolean };
    }> {
      await repo.checkSubscriptionNotices(driverId, now);
      await repo.locateDriver(driverId);
      const driver = await getDriver(driverId);
      const start = await startPoint(driver);
      const day = localDay(now);
      const riders = await passengersOf(driverId, day);
      const passengers: Passenger[] = riders.map(({ point: _point, ...passenger }) => passenger);
      const counts = new Map<string, number>();
      for (const passenger of passengers) counts.set(passenger.college, (counts.get(passenger.college) ?? 0) + 1);
      const mainDestination = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? driver.colleges[0] ?? "—";
      const runs = await routeRuns(driverId, day);
      const today: DriverToday = {
        day,
        weekday: weekdayOf(day),
        going: passengers.filter((p) => p.going === true).length,
        notGoing: passengers.filter((p) => p.going === false).length,
        pending: passengers.filter((p) => p.going === null).length,
        legs: legs.map((leg) => {
          const run = runs[leg];
          // viagem finalizada: a próxima previsão volta a contar do horário programado
          const started = run && !run.finished ? run.started : undefined;
          const scheduled = scheduledTime(driver, leg);
          const planned = planLeg(
            driver,
            leg,
            riders.filter((r) => r.going === true),
            start,
          );
          let route: LegRoute | null = null;
          let predicted = false;
          if (planned) {
            const names = new Map(riders.map((r) => [r.studentId, r]));
            const stops = planned.plan.stops.map((stop) => {
              const rider = names.get(stop.id)!;
              const at = clockAt(started, scheduled, stop.minutes);
              predicted = at?.predicted ?? false;
              return {
                studentId: rider.studentId,
                name: rider.name,
                pickup: rider.pickup,
                order: stop.order,
                eta: at?.time ?? null,
                legMinutes: stop.legMinutes,
                legKm: stop.legKm,
              };
            });
            const end = clockAt(started, scheduled, planned.plan.totalMinutes);
            route = {
              origin: leg === "ida" ? (driver.startAddress ?? driver.cities[0] ?? null) : planned.destination,
              destination: planned.destination,
              end: planned.plan.end,
              totalMinutes: planned.plan.totalMinutes,
              distanceKm: planned.plan.distanceKm,
              arrival: end?.time ?? null,
              stops,
            };
          }
          return {
            leg,
            scheduled,
            startedAt: run ? localTime(run.started) : null,
            finishedAt: run?.finished ? localTime(run.finished) : null,
            eta: null,
            predicted,
            route,
          };
        }),
      };
      const acceptance = await repo.termsAcceptance(driverId);
      const terms = {
        version: TERMS_VERSION,
        acceptedVersion: acceptance.version,
        acceptedAt: acceptance.acceptedAt,
        accepted: acceptance.version === TERMS_VERSION,
      };
      return {
        driver,
        passengers,
        mainDestination,
        today,
        subscription: subscriptionInfo(driver.subscriptionUntil, day, isDemoEmail(driver.email)),
        documents: await repo.listDocuments(driverId),
        terms,
      };
    },

    // Descobre a posição do endereço do estudante (uma tentativa por execução do servidor; falhou, usa a aproximação)
    async locateStudent(
      studentId: number,
      locate: (address: string) => Promise<Point | null> = geocode,
    ): Promise<void> {
      if (triedLocating.has(studentId)) return;
      const row = await get<{ lat: number | null; email: string; address: string }>(
        "SELECT lat, email, address FROM students WHERE id = ?",
        [studentId],
      );
      if (!row || row.lat !== null || isDemoEmail(row.email)) return;
      triedLocating.add(studentId);
      const point = await locate(row.address);
      if (point) await run("UPDATE students SET lat = ?, lng = ? WHERE id = ?", [point.lat, point.lng, studentId]);
    },

    // Painel do estudante: a van dele, se vai hoje e os horários de ida e volta
    async studentToday(studentId: number, now = new Date()): Promise<StudentToday> {
      const day = localDay(now);
      const base = { day, weekday: weekdayOf(day) };
      const booking = await activeBooking(studentId);
      if (!booking) {
        return {
          ...base,
          going: null,
          van: null,
          legs: legs.map((leg) => ({ leg, scheduled: null, startedAt: null, eta: null, predicted: false })),
        };
      }
      const driver = await getDriver(booking.driverId);
      const passengers = await passengersOf(driver.id, day);
      const riders = passengers.filter((p) => p.going === true);
      const going = passengers.find((p) => p.studentId === studentId)?.going ?? null;
      const runs = await routeRuns(driver.id, day);
      const start = await startPoint(driver);
      return {
        ...base,
        going,
        van: {
          driverId: driver.id,
          driver: driver.name,
          phone: driver.phone,
          vehicle: `${driver.vanModel} • placa ${driver.plate}`,
          pickup: booking.pickup,
          pickupTime: booking.pickupTime,
          status: booking.status,
          goingCount: riders.length,
        },
        legs: legs.map((leg) => {
          const run = runs[leg];
          const started = run && !run.finished ? run.started : undefined;
          const scheduled = scheduledTime(driver, leg);
          const planned = going === true ? planLeg(driver, leg, riders, start) : null;
          const minutes = planned?.plan.stops.find((stop) => stop.id === studentId)?.minutes;
          const at = minutes === undefined ? null : clockAt(started, scheduled, minutes);
          const ride = minutes === undefined ? null : leg === "ida" ? planned!.plan.totalMinutes - minutes : minutes;
          return {
            leg,
            scheduled,
            startedAt: run ? localTime(run.started) : null,
            finishedAt: run?.finished ? localTime(run.finished) : null,
            eta: at?.time ?? null,
            predicted: at?.predicted ?? false,
            rideMinutes: ride,
          };
        }),
      };
    },

    // Estudante avisa se vai hoje; ele e o motorista recebem um aviso
    async setAttendance(studentId: number, going: unknown, now = new Date()): Promise<StudentToday> {
      if (typeof going !== "boolean") throw new ApiError(400, "Informe se você vai hoje (going: true ou false).");
      const booking = await activeBooking(studentId);
      if (!booking) throw new ApiError(409, "Reserve uma vaga numa van para confirmar presença.");
      const day = localDay(now);
      const previous = await get<{ going: number }>("SELECT going FROM attendance WHERE student_id = ? AND day = ?", [
        studentId,
        day,
      ]);
      await run(
        `INSERT INTO attendance (student_id, driver_id, day, going) VALUES (?, ?, ?, ?)
                 ON CONFLICT (student_id, day) DO UPDATE SET driver_id = excluded.driver_id, going = excluded.going, updated_at = datetime('now')`,
        [studentId, booking.driverId, day, going ? 1 : 0],
      );
      if (!previous || Boolean(previous.going) !== going) {
        const student = await getStudent(studentId);
        const firstName = student.name.split(" ")[0];
        await notify(
          { profile: "student", id: studentId },
          going ? "Presença confirmada" : "Ausência registrada",
          going
            ? "Presença confirmada: você vai hoje. O motorista já sabe."
            : "Você avisou que não vai hoje. O motorista não vai passar no seu ponto.",
        );
        await notify(
          { profile: "driver", id: booking.driverId },
          going ? `${firstName} vai hoje` : `${firstName} não vai hoje`,
          `${student.name} ${going ? "confirmou presença" : "avisou que não vai"} hoje (${weekdayOf(day).toLowerCase()}). Embarque: ${booking.pickup}.`,
        );
      }
      return repo.studentToday(studentId, now);
    },

    // Motorista inicia a ida ou a volta: quem vai hoje recebe a previsão de chegada.
    // Viagem já finalizada pode ser iniciada de novo (ex.: outra turma no mesmo dia, ou uma demonstração).
    async startRoute(driverId: number, leg: unknown, now = new Date()): Promise<DriverToday> {
      if (leg !== "ida" && leg !== "volta") throw new ApiError(400, "Escolha a viagem: ida ou volta.");
      const day = localDay(now);
      const startedAt = now.toISOString().slice(0, 19).replace("T", " ");
      const { rowsAffected } = await db.execute({
        sql: `INSERT INTO route_runs (driver_id, day, leg, started_at) VALUES (?, ?, ?, ?)
              ON CONFLICT (driver_id, day, leg) DO UPDATE SET started_at = excluded.started_at, finished_at = NULL
              WHERE route_runs.finished_at IS NOT NULL`,
        args: [driverId, day, leg, startedAt],
      });
      if (rowsAffected === 0)
        throw new ApiError(
          409,
          leg === "ida" ? "A ida de hoje já está em andamento." : "A volta de hoje já está em andamento.",
        );
      const riders = (await passengersOf(driverId, day)).filter((p) => p.going === true);
      const driver = await getDriver(driverId);
      const planned = planLeg(driver, leg, riders, await startPoint(driver));
      for (const rider of riders) {
        const minutes = planned!.plan.stops.find((stop) => stop.id === rider.studentId)!.minutes;
        const eta = localTime(addMinutes(now, minutes));
        await notify(
          { profile: "student", id: rider.studentId },
          leg === "ida" ? "A van saiu para te buscar" : "A van saiu da faculdade",
          leg === "ida"
            ? `O motorista iniciou a rota às ${localTime(now)}. Previsão no seu ponto (${rider.pickup}): ${eta}.`
            : `O motorista iniciou a volta às ${localTime(now)}. Previsão de chegada em casa: ${eta}.`,
        );
      }
      return (await repo.driverDashboard(driverId, now)).today;
    },

    // Motorista finaliza a viagem em andamento (chegou na faculdade, ou deixou todos em casa na volta).
    // A presença do dia é zerada: os alunos voltam a ver "Vou hoje" / "Não vou hoje" e respondem de novo
    // (na ida, para dizer se voltam com a van; na volta, para a próxima viagem).
    async finishRoute(driverId: number, leg: unknown, now = new Date()): Promise<DriverToday> {
      if (leg !== "ida" && leg !== "volta") throw new ApiError(400, "Escolha a viagem: ida ou volta.");
      const day = localDay(now);
      const finishedAt = now.toISOString().slice(0, 19).replace("T", " ");
      const riders = (await passengersOf(driverId, day)).filter((p) => p.going === true);
      const { rowsAffected } = await db.execute({
        sql: "UPDATE route_runs SET finished_at = ? WHERE driver_id = ? AND day = ? AND leg = ? AND finished_at IS NULL",
        args: [finishedAt, driverId, day, leg],
      });
      if (rowsAffected === 0)
        throw new ApiError(
          409,
          leg === "ida" ? "A ida de hoje não está em andamento." : "A volta de hoje não está em andamento.",
        );
      await run("DELETE FROM attendance WHERE driver_id = ? AND day = ?", [driverId, day]);
      const driver = await getDriver(driverId);
      for (const rider of riders) {
        await notify(
          { profile: "student", id: rider.studentId },
          leg === "ida" ? "Chegamos na faculdade" : "Viagem encerrada",
          leg === "ida"
            ? `${driver.name} finalizou a ida às ${localTime(now)}. Você volta com a van? Responda "Vou" ou "Não vou" no painel.`
            : `${driver.name} finalizou a volta às ${localTime(now)}. Na próxima viagem, confirme no painel se você vai.`,
        );
      }
      return (await repo.driverDashboard(driverId, now)).today;
    },

    // Últimos avisos do usuário logado
    async notifications(user: SessionUser): Promise<{ unread: number; items: Notification[] }> {
      if (user.profile === "driver") await repo.checkSubscriptionNotices(user.id);
      const rows = await all<{ id: number; title: string; body: string; createdAt: string; readAt: string | null }>(
        `
        SELECT id, title, body, created_at AS createdAt, read_at AS readAt FROM notifications
        WHERE profile = ? AND user_id = ? ORDER BY id DESC LIMIT 30`,
        [user.profile, user.id],
      );
      const { unread } = (await get<{ unread: number }>(
        "SELECT COUNT(*) AS unread FROM notifications WHERE profile = ? AND user_id = ? AND read_at IS NULL",
        [user.profile, user.id],
      ))!;
      return {
        unread,
        items: rows.map((row) => ({
          id: row.id,
          title: row.title,
          body: row.body,
          createdAt: fromSqlTime(row.createdAt).toISOString(),
          read: row.readAt !== null,
        })),
      };
    },

    async markNotificationsRead(user: SessionUser): Promise<{ ok: true }> {
      await run(
        "UPDATE notifications SET read_at = datetime('now') WHERE profile = ? AND user_id = ? AND read_at IS NULL",
        [user.profile, user.id],
      );
      return { ok: true };
    },

    // Cada estudante fica em uma van só: com `replace`, a reserva atual é cancelada e a nova entra no lugar
    // Reserva de vaga. Regras: uma van ativa por estudante (trocar exige `replace: true`, que cancela a
    // anterior), a van precisa ter assinatura em dia e vaga livre. Tudo numa transação para não
    // estourar a lotação com duas reservas ao mesmo tempo. O motorista recebe aviso no sino.
    createBooking(data: {
      studentId?: number | string;
      driverId?: number | string;
      replace?: unknown;
    }): Promise<{ id: number; status: BookingStatus }> {
      const input = data as Record<string, unknown>;
      const studentId = Number(text(input, "studentId"));
      const driverId = Number(text(input, "driverId"));
      return transaction(async (tx) => {
        const student = await getStudent(studentId, tx);
        const driver = await getDriver(driverId, tx);
        const existing = await get<{ id: number; status: BookingStatus }>(
          "SELECT id, status FROM bookings WHERE student_id = ? AND driver_id = ?",
          [student.id, driver.id],
          tx,
        );
        if (existing && existing.status !== "Cancelado")
          throw new ApiError(409, "Você já reservou uma vaga nesta van.");
        if (!driver.subscriptionActive)
          throw new ApiError(409, "Esta van não está recebendo novas reservas no momento.");
        if (driver.freeSeats <= 0) throw new ApiError(409, "Esta van não tem vagas livres.");
        const others = await all<{ id: number; driverId: number }>(
          "SELECT id, driver_id AS driverId FROM bookings WHERE student_id = ? AND driver_id <> ? AND status <> 'Cancelado'",
          [student.id, driver.id],
          tx,
        );
        if (others.length > 0) {
          if (data.replace !== true) {
            throw new ApiError(
              409,
              "Você já escolheu uma van. Cancele a reserva atual ou troque de van para escolher esta.",
            );
          }
          for (const other of others) {
            await run("UPDATE bookings SET status = 'Cancelado' WHERE id = ?", [other.id], tx);
            await notify(
              { profile: "driver", id: other.driverId },
              "Vaga liberada",
              `${student.name} trocou de van e saiu da sua rota.`,
              tx,
            );
          }
        }
        await notify(
          { profile: "driver", id: driver.id },
          "Nova reserva",
          `${student.name} reservou uma vaga na sua van. Confirme ou recuse no painel.`,
          tx,
        );
        if (existing) {
          await run(
            "UPDATE bookings SET status = 'Aguardando', pickup = ? WHERE id = ?",
            [student.address, existing.id],
            tx,
          );
          return { id: existing.id, status: "Aguardando" as const };
        }
        const id = await run(
          "INSERT INTO bookings (student_id, driver_id, pickup) VALUES (?, ?, ?)",
          [student.id, driver.id, student.address],
          tx,
        );
        return { id, status: "Aguardando" as const };
      });
    },

    // Motorista confirma/recusa a reserva ou define o horário de embarque; o estudante é avisado da decisão
    async updateBooking(
      id: number,
      { status, pickupTime }: { status?: string; pickupTime?: string | null },
    ): Promise<Booking> {
      if (status !== undefined && !bookingStatuses.includes(status as BookingStatus)) {
        throw new ApiError(400, "Status inválido.");
      }
      if (pickupTime !== undefined && pickupTime !== null && !timePattern.test(pickupTime)) {
        throw new ApiError(400, "Horário de embarque inválido (use HH:MM).");
      }
      const before = await getBooking(id);
      if (before.status === "Cancelado" && status !== undefined && status !== "Cancelado") {
        throw new ApiError(409, "Esta reserva foi cancelada.");
      }
      if (status !== undefined) await run("UPDATE bookings SET status = ? WHERE id = ?", [status, id]);
      if (status !== undefined && status !== before.status && status !== "Aguardando") {
        const row = (await get<{ studentId: number; driver: string }>(
          "SELECT b.student_id AS studentId, d.name AS driver FROM bookings b JOIN drivers d ON d.id = b.driver_id WHERE b.id = ?",
          [id],
        ))!;
        await notify(
          { profile: "student", id: row.studentId },
          status === "Confirmado" ? "Reserva confirmada" : "Reserva recusada",
          status === "Confirmado"
            ? `${row.driver} confirmou sua vaga. Agora é só avisar no painel, todo dia, se você vai.`
            : `${row.driver} não pôde confirmar sua vaga. Procure outra van no painel.`,
        );
      }
      if (pickupTime !== undefined) await run("UPDATE bookings SET pickup_time = ? WHERE id = ?", [pickupTime, id]);
      return getBooking(id);
    },

    // Conta usada no login (o e-mail é único dentro de cada perfil)
    findAccount(
      profile: "student" | "driver",
      email: string,
    ): Promise<{ id: number; name: string; passwordHash: string | null } | undefined> {
      const table = profile === "student" ? "students" : "drivers";
      return get(`SELECT id, name, password_hash AS passwordHash FROM ${table} WHERE email = ?`, [email.trim()]);
    },

    async accountName(user: SessionUser): Promise<string> {
      if (user.profile === "admin") return "Administrador";
      return (user.profile === "student" ? await getStudent(user.id) : await getDriver(user.id)).name;
    },

    // Grava a sessão (só o hash do token) e aproveita para limpar as sessões vencidas
    async createSession(tokenHash: string, user: SessionUser, days: number): Promise<void> {
      await run("DELETE FROM sessions WHERE expires_at <= datetime('now')");
      await run(
        `INSERT INTO sessions (token_hash, profile, user_id, expires_at)
                 VALUES (?, ?, ?, datetime('now', ?))`,
        [tokenHash, user.profile, user.id, `+${days} days`],
      );
    },

    // Sessão válida (não expirada e de uma conta que ainda existe)
    getSession(tokenHash: string): Promise<SessionUser | undefined> {
      return get<{ profile: Profile; id: number }>(
        `
        SELECT se.profile, se.user_id AS id FROM sessions se
        WHERE se.token_hash = ? AND se.expires_at > datetime('now')
          AND (se.profile = 'admin'
            OR (se.profile = 'student' AND EXISTS (SELECT 1 FROM students WHERE id = se.user_id))
            OR (se.profile = 'driver' AND EXISTS (SELECT 1 FROM drivers WHERE id = se.user_id)))`,
        [tokenHash],
      );
    },

    async deleteSession(tokenHash: string): Promise<void> {
      await run("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
    },

    // Motorista dono da van de uma reserva
    async bookingDriverId(id: number): Promise<number> {
      const row = await get<{ driverId: number }>("SELECT driver_id AS driverId FROM bookings WHERE id = ?", [id]);
      if (!row) throw new ApiError(404, "Reserva não encontrada.");
      return row.driverId;
    },

    // Visão geral de todas as tabelas para a página de administração (/admin)
    async adminOverview() {
      const drivers = await all<DriverRow & { createdAt: string }>(
        `${driverSummarySql.replace("d.rating,", "d.rating, d.created_at AS createdAt,")} ORDER BY d.id DESC`,
      );
      return {
        colleges: await all<Record<string, unknown>>(`
          SELECT c.id, c.name,
                 (SELECT COUNT(*) FROM students s WHERE s.college_id = c.id) AS students,
                 (SELECT COUNT(*) FROM driver_colleges dc WHERE dc.college_id = c.id) AS drivers
          FROM colleges c ORDER BY c.name`),
        students: await all<Record<string, unknown>>(`
          SELECT s.id, s.name, s.email, s.phone, s.address, c.name AS college, s.created_at AS createdAt
          FROM students s JOIN colleges c ON c.id = s.college_id ORDER BY s.id DESC`),
        drivers: drivers.map((row) => {
          const driver = toDriver(row);
          return {
            ...driver,
            cities: driver.cities.join(", "),
            colleges: driver.colleges.join(", "),
            createdAt: row.createdAt,
          };
        }),
        bookings: await all<Record<string, unknown>>(`
          SELECT b.id, s.name AS student, d.name AS driver, b.pickup, b.pickup_time AS pickupTime, b.status, b.created_at AS createdAt
          FROM bookings b JOIN students s ON s.id = b.student_id JOIN drivers d ON d.id = b.driver_id ORDER BY b.id DESC`),
        attendance: (
          await all<Record<string, unknown>>(`
          SELECT a.day, s.name AS student, d.name AS driver, a.going, a.updated_at AS createdAt
          FROM attendance a JOIN students s ON s.id = a.student_id JOIN drivers d ON d.id = a.driver_id
          ORDER BY a.day DESC, a.updated_at DESC LIMIT 500`)
        ).map((row, index) => ({ ...row, id: index + 1, going: row.going ? "Vai" : "Não vai" })),
        searches: await all<Record<string, unknown>>(`
          SELECT se.id, se.address, c.name AS college, se.results, se.created_at AS createdAt
          FROM searches se JOIN colleges c ON c.id = se.college_id ORDER BY se.id DESC LIMIT 500`),
      };
    },

    // Contas antigas podem ter várias reservas ativas: fica só uma por estudante (a confirmada,
    // senão a mais recente) e o banco passa a impedir duas reservas ativas do mesmo estudante.
    async ensureOneVanPerStudent(): Promise<void> {
      const rows = await all<{ id: number; studentId: number; driverId: number; name: string }>(`
        SELECT b.id, b.student_id AS studentId, b.driver_id AS driverId, s.name FROM bookings b JOIN students s ON s.id = b.student_id
        WHERE b.status <> 'Cancelado' AND b.student_id IN (
          SELECT student_id FROM bookings WHERE status <> 'Cancelado' GROUP BY student_id HAVING COUNT(*) > 1)
        ORDER BY b.student_id, b.status = 'Confirmado' DESC, b.created_at DESC, b.id DESC`);
      const kept = new Set<number>();
      for (const row of rows) {
        if (!kept.has(row.studentId)) {
          kept.add(row.studentId);
          continue;
        }
        await run("UPDATE bookings SET status = 'Cancelado' WHERE id = ?", [row.id]);
        await notify(
          { profile: "driver", id: row.driverId },
          "Vaga liberada",
          `${row.name} ficou em uma van só e saiu da sua rota.`,
        );
        await notify(
          { profile: "student", id: row.studentId },
          "Uma van por aluno",
          "Você tinha mais de uma van reservada. Mantivemos a reserva confirmada (ou a mais recente) e cancelamos as outras.",
        );
      }
      await run(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_booking_per_student ON bookings(student_id) WHERE status <> 'Cancelado'",
      );
    },

    // Senha (hash) da conta logada, para confirmar a exclusão
    async passwordHashOf(user: SessionUser): Promise<string | null> {
      const table = user.profile === "student" ? "students" : "drivers";
      return (
        (await get<{ hash: string | null }>(`SELECT password_hash AS hash FROM ${table} WHERE id = ?`, [user.id]))
          ?.hash ?? null
      );
    },

    // Exclui a conta e tudo o que depende dela (reservas, presenças, avisos e sessões)
    async deleteAccount(user: SessionUser): Promise<{ ok: true }> {
      if (user.profile === "admin") throw new ApiError(403, "Esta conta não pode ser excluída.");
      await transaction(async (tx) => {
        if (user.profile === "student") {
          const driverIds = await all<{ driverId: number }>(
            "SELECT DISTINCT driver_id AS driverId FROM bookings WHERE student_id = ? AND status <> 'Cancelado'",
            [user.id],
            tx,
          );
          const student = await getStudent(user.id, tx);
          for (const { driverId } of driverIds) {
            await notify(
              { profile: "driver", id: driverId },
              "Vaga liberada",
              `${student.name} excluiu a conta e saiu da sua van.`,
              tx,
            );
          }
          for (const table of ["attendance", "bookings"])
            await run(`DELETE FROM ${table} WHERE student_id = ?`, [user.id], tx);
          await run("DELETE FROM students WHERE id = ?", [user.id], tx);
        } else {
          const riders = await all<{ studentId: number }>(
            "SELECT DISTINCT student_id AS studentId FROM bookings WHERE driver_id = ? AND status <> 'Cancelado'",
            [user.id],
            tx,
          );
          const driver = await getDriver(user.id, tx);
          for (const { studentId } of riders) {
            await notify(
              { profile: "student", id: studentId },
              "Van encerrada",
              `${driver.name} excluiu a conta. Escolha outra van no painel.`,
              tx,
            );
          }
          for (const table of [
            "attendance",
            "route_runs",
            "bookings",
            "driver_cities",
            "driver_colleges",
            "driver_documents",
          ]) {
            await run(`DELETE FROM ${table} WHERE driver_id = ?`, [user.id], tx);
          }
          await run("DELETE FROM drivers WHERE id = ?", [user.id], tx);
        }
        await run("DELETE FROM notifications WHERE profile = ? AND user_id = ?", [user.profile, user.id], tx);
        await run("DELETE FROM sessions WHERE profile = ? AND user_id = ?", [user.profile, user.id], tx);
      });
      return { ok: true };
    },

    // Faculdades atendidas: dados de referência que o cadastro precisa, criados sempre
    // (em qualquer banco). Idempotente: ignora as que já existem.
    async ensureColleges(): Promise<void> {
      await db.batch(
        defaultColleges.map((name) => ({ sql: "INSERT OR IGNORE INTO colleges (name) VALUES (?)", args: [name] })),
        "write",
      );
    },

    // Limpeza única (ver REMOVE_OLD_DRIVERS): apaga todos os motoristas e os alunos fictícios antigos.
    // Alunos de verdade continuam, sem van, e recebem um aviso para escolher de novo.
    async removeOldDrivers(): Promise<void> {
      if (await get("SELECT 1 AS done FROM data_migrations WHERE name = ?", [REMOVE_OLD_DRIVERS])) return;
      await transaction(async (tx) => {
        // marca primeiro: se outra instância do servidor já fez a limpeza, não apaga de novo
        const { rowsAffected } = await tx.execute({
          sql: "INSERT OR IGNORE INTO data_migrations (name) VALUES (?)",
          args: [REMOVE_OLD_DRIVERS],
        });
        if (rowsAffected === 0) return;
        const riders = await all<{ studentId: number }>(
          `SELECT DISTINCT b.student_id AS studentId FROM bookings b JOIN students s ON s.id = b.student_id
           WHERE b.status <> 'Cancelado' AND s.email NOT LIKE ? AND s.email NOT LIKE ?`,
          [`%@${DEMO_DOMAIN}`, `%@${LEGACY_DEMO_DOMAIN}`],
          tx,
        );
        for (const { studentId } of riders) {
          await notify(
            { profile: "student", id: studentId },
            "Escolha sua van de novo",
            "Os motoristas foram recadastrados com o endereço de saída da van. Escolha uma van no painel.",
            tx,
          );
        }
        await deleteDrivers("SELECT id FROM drivers", [], tx);
        await deleteStudents("SELECT id FROM students WHERE email LIKE ?", [`%@${LEGACY_DEMO_DOMAIN}`], tx);
      });
    },

    // Contas de demonstração (demo.ts): cria o que falta e garante cada aluno na van dele. Idempotente.
    // Com enabled=false (DEMO_VANS=false), apaga todas elas. As vans antigas sem senha nunca voltam.
    async syncDemo(enabled: boolean, locate: (address: string) => Promise<Point | null> = geocode): Promise<void> {
      if (!enabled) {
        const demo = [`%@${DEMO_DOMAIN}`, `%@${LEGACY_DEMO_DOMAIN}`];
        await transaction(async (tx) => {
          await deleteDrivers("SELECT id FROM drivers WHERE email LIKE ? OR email LIKE ?", demo, tx);
          await deleteStudents("SELECT id FROM students WHERE email LIKE ? OR email LIKE ?", demo, tx);
        });
        return;
      }
      // Caminho rápido (toda vez que o servidor sobe, inclusive na Vercel): uma consulta só confere se já está tudo lá
      const demo = `%@${DEMO_DOMAIN}`;
      const status = (await get<{ drivers: number; students: number; rides: number; links: number; colleges: number }>(
        `SELECT (SELECT COUNT(*) FROM drivers WHERE email LIKE ?) AS drivers,
                (SELECT COUNT(*) FROM students WHERE email LIKE ?) AS students,
                (SELECT COUNT(*) FROM bookings b JOIN students s ON s.id = b.student_id
                   WHERE s.email LIKE ? AND b.status <> 'Cancelado') AS rides,
                (SELECT COUNT(*) FROM driver_colleges dc JOIN drivers d ON d.id = dc.driver_id WHERE d.email LIKE ?) AS links,
                (SELECT COUNT(*) FROM colleges) AS colleges`,
        [demo, demo, demo, demo],
      ))!;
      const studentCount = demoDrivers.reduce((total, driver) => total + driver.students.length, 0);
      if (
        status.drivers === demoDrivers.length &&
        status.students === studentCount &&
        status.rides === studentCount &&
        status.links === demoDrivers.length * status.colleges
      )
        return;

      // Falta algo: cria tudo de uma vez, num único pedido ao banco (no Turso cada consulta é uma ida e volta
      // pela internet, e centenas delas estouravam o tempo da função na Vercel). Tudo é "se ainda não existir".
      const missing = async (table: "drivers" | "students", email: string) =>
        !(await get(`SELECT 1 AS found FROM ${table} WHERE email = ?`, [email]));
      // endereço informado pelo projeto: tenta o mapa (só na criação); senão, a posição fixa de demo.ts
      const pointOf = async (place: DemoPlace, table: "drivers" | "students", email: string): Promise<Point> =>
        (place.geocode && (await missing(table, email)) ? await locate(place.address) : null) ?? {
          lat: place.lat,
          lng: place.lng,
        };
      const passwordHash =
        status.drivers < demoDrivers.length || status.students < studentCount ? hashPasswordSync(DEMO_PASSWORD) : null;
      const statements: InStatement[] = [];
      for (const driver of demoDrivers) {
        const start = await pointOf(driver.start, "drivers", driver.email);
        statements.push({
          sql: `INSERT INTO drivers (name, phone, email, van_model, plate, capacity, departure_time, return_time,
                  start_address, start_lat, start_lng, rating, password_hash, terms_version, terms_accepted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now')) ON CONFLICT DO NOTHING`,
          args: [
            driver.name,
            driver.phone,
            driver.email,
            driver.vanModel,
            driver.plate,
            driver.capacity,
            driver.departureTime,
            driver.returnTime,
            driver.start.address,
            start.lat,
            start.lng,
            driver.rating,
            passwordHash,
            TERMS_VERSION,
          ],
        });
        for (const [position, city] of driver.cities.entries()) {
          statements.push({
            sql: "INSERT OR IGNORE INTO driver_cities (driver_id, position, city) SELECT id, ?, ? FROM drivers WHERE email = ?",
            args: [position, city, driver.email],
          });
        }
        for (const student of driver.students) {
          const point = await pointOf(student, "students", student.email);
          statements.push({
            sql: `INSERT INTO students (name, phone, email, address, college_id, password_hash, lat, lng)
                  SELECT ?, '(15) 90000-0000', ?, ?, id, ?, ?, ? FROM colleges WHERE name = ? ON CONFLICT DO NOTHING`,
            args: [student.name, student.email, student.address, passwordHash, point.lat, point.lng, DEMO_COLLEGE],
          });
          // aluno de demonstração sem van (ex.: cancelou durante a apresentação) volta para a van dele
          statements.push({
            sql: `INSERT INTO bookings (student_id, driver_id, pickup, status)
                  SELECT s.id, d.id, ?, 'Confirmado' FROM students s, drivers d
                  WHERE s.email = ? AND d.email = ?
                    AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.student_id = s.id AND b.status <> 'Cancelado')
                  ON CONFLICT (student_id, driver_id) DO UPDATE SET status = 'Confirmado', pickup = excluded.pickup`,
            args: [student.address, student.email, driver.email],
          });
        }
      }
      // motoristas de demonstração atendem todas as faculdades, inclusive as cadastradas depois
      statements.push({
        sql: `INSERT OR IGNORE INTO driver_colleges (driver_id, college_id)
              SELECT d.id, c.id FROM drivers d, colleges c WHERE d.email LIKE ?`,
        args: [demo],
      });
      await db.batch(statements, "write");
    },
  };

  // Apaga motoristas (consulta `idsSql` devolve os ids) e tudo o que depende deles
  async function deleteDrivers(idsSql: string, args: InValue[], tx: Executor): Promise<void> {
    for (const table of [
      "attendance",
      "route_runs",
      "bookings",
      "driver_cities",
      "driver_colleges",
      "driver_documents",
    ]) {
      await run(`DELETE FROM ${table} WHERE driver_id IN (${idsSql})`, args, tx);
    }
    for (const table of ["sessions", "notifications"]) {
      await run(`DELETE FROM ${table} WHERE profile = 'driver' AND user_id IN (${idsSql})`, args, tx);
    }
    await run(`DELETE FROM drivers WHERE id IN (${idsSql})`, args, tx);
  }

  // Apaga estudantes e tudo o que depende deles
  async function deleteStudents(idsSql: string, args: InValue[], tx: Executor): Promise<void> {
    for (const table of ["attendance", "bookings"]) {
      await run(`DELETE FROM ${table} WHERE student_id IN (${idsSql})`, args, tx);
    }
    for (const table of ["sessions", "notifications"]) {
      await run(`DELETE FROM ${table} WHERE profile = 'student' AND user_id IN (${idsSql})`, args, tx);
    }
    await run(`DELETE FROM students WHERE id IN (${idsSql})`, args, tx);
  }

  return repo;
}
