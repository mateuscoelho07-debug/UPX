// Camada de acesso ao banco de dados do RotaU.
// Usa o libSQL (compatível com SQLite): um arquivo local em desenvolvimento
// e o Turso (banco gratuito na nuvem) quando o site está publicado.
import { createClient, type Client, type InValue, type Transaction } from "@libsql/client";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ApiError } from "./errors.ts";
import { hashPasswordSync, type Profile, type SessionUser } from "./auth.ts";
import { schema } from "./schema.ts";
import { demoStudents } from "./demo.ts";
import { geocode } from "./geocode.ts";
import { mapsLinks, type MapsLink } from "./maps.ts";
import { approximatePoint, collegePoint, collegeSearch, placePoint } from "./places.ts";
import { planRoute, type Point, type RoutePlan } from "./route.ts";
import { isSubscriptionActive, renewedUntil, subscriptionConfig, subscriptionInfo, type SubscriptionInfo } from "./subscription.ts";
import { addMinutes, clockPlus, fromSqlTime, localDay, localTime, weekdayOf } from "./time.ts";

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
  rating: number;
  occupied: number;
  freeSeats: number;
  cities: string[];
  colleges: string[];
  subscriptionUntil: string | null;
  // assinatura em dia (ou motorista de demonstração): só assim a van aparece para os alunos
  subscriptionActive: boolean;
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
type Rider = Passenger & { point: Point | null; mapsQuery: string };

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
  rating?: number;
  cities?: string | string[];
  colleges?: string | string[];
  passwordHash?: string;
};

type DriverRow = Omit<Driver, "cities" | "colleges" | "freeSeats" | "subscriptionActive"> & { cities: string | null; colleges: string | null };

export type Leg = "ida" | "volta";
export const legs: Leg[] = ["ida", "volta"];

// Uma perna da viagem de hoje: horário programado, quando o motorista saiu e a previsão no ponto do estudante
// `eta` = previsão no ponto do estudante; `predicted` = calculada a partir do horário programado (a van ainda não saiu)
export type TodayLeg = {
  leg: Leg;
  scheduled: string | null;
  startedAt: string | null;
  eta: string | null;
  predicted: boolean;
  // minutos que o estudante passa na van nesta viagem (da hora que embarca até a faculdade, ou da faculdade até em casa)
  rideMinutes?: number | null;
};

// Rota calculada pelos endereços: ordem das paradas, tempo e distância
export type RouteStopInfo = { studentId: number; name: string; pickup: string; order: number; eta: string | null };
export type LegRoute = {
  destination: string | null;
  totalMinutes: number;
  distanceKm: number;
  arrival: string | null;
  stops: RouteStopInfo[];
  // rota pronta no Google Maps (vários links se passar de 9 paradas)
  mapsLinks: MapsLink[];
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
  if (process.env.SEED !== "false") await repo.seedDemoData();
  await repo.syncDemoVans(process.env.DEMO_VANS !== "false");
  return repo;
}

// Bancos antigos não têm as colunas novas: senha (login) e horário da volta (presença)
async function migrate(db: Client) {
  const columns: [string, string, string][] = [
    ["students", "password_hash", "TEXT"], ["drivers", "password_hash", "TEXT"], ["drivers", "return_time", "TEXT"],
    ["students", "lat", "REAL"], ["students", "lng", "REAL"],
    ["drivers", "subscription_until", "TEXT"], ["drivers", "subscription_notice", "TEXT"],
  ];
  for (const [table, column, type] of columns) {
    const { rows } = await db.execute(`PRAGMA table_info(${table})`);
    if (!rows.some((row) => row.name === column)) {
      await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
}

// Senha das contas de exemplo criadas pelo seed (ver README)
export const DEMO_PASSWORD = "rotau1234";

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

function splitList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
}

// Faculdades da região de Sorocaba (os 5 primeiros nomes já existem nos bancos publicados; não renomear).
// Unesp, IFSP, PUC-SP e Ceunsp têm campi na região (Sorocaba, Itu/Salto e cidades vizinhas).
export const defaultColleges = ["UniFacens", "Fatec", "Ufscar", "Uniso", "Unip", "Unesp", "IFSP", "PUC-SP", "Anhanguera", "ESAMC", "Fadi", "Ceunsp"];

// Vans FICTÍCIAS de demonstração: cobrem toda a região de Sorocaba e todas as faculdades,
// para a busca nunca ficar vazia enquanto não há motoristas reais. São criadas sempre
// (mesmo com SEED=false), mas sem senha: ninguém consegue entrar nessas contas.
// Para removê-las, defina DEMO_VANS=false e publique de novo (ver PUBLICAR.md).
export const DEMO_VAN_DOMAIN = "demo.rotau.invalid";

type DemoVan = { key: string; name: string; vanModel: string; capacity: number; departureTime: string; rating: number; cities: string[] };

// Horário de volta das vans de demonstração (saída da faculdade, depois da última aula)
const DEMO_RETURN_TIME = "22:40";

const demoVans: DemoVan[] = [
  { key: "centro", name: "Paulo Mendes", vanModel: "Renault Master", capacity: 15, departureTime: "17:40", rating: 4.8, cities: ["Sorocaba (Centro)", "Vila Hortência", "Jd. Faculdade"] },
  { key: "norte", name: "Juliana Prado", vanModel: "Mercedes Sprinter", capacity: 16, departureTime: "17:20", rating: 4.9, cities: ["Sorocaba (Zona Norte)", "Éden", "Itavuvu"] },
  { key: "sul", name: "Marcos Teixeira", vanModel: "Fiat Ducato", capacity: 14, departureTime: "17:45", rating: 4.7, cities: ["Sorocaba (Zona Sul)", "Campolim", "Jd. Europa"] },
  { key: "leste", name: "Sandra Oliveira", vanModel: "Peugeot Boxer", capacity: 14, departureTime: "17:30", rating: 4.8, cities: ["Sorocaba (Zona Leste)", "Brigadeiro Tobias"] },
  { key: "oeste", name: "Ricardo Nunes", vanModel: "Renault Master", capacity: 15, departureTime: "17:35", rating: 4.6, cities: ["Sorocaba (Zona Oeste)", "Wanel Ville"] },
  { key: "votorantim", name: "Cláudia Ramos", vanModel: "Mercedes Sprinter", capacity: 16, departureTime: "17:00", rating: 4.9, cities: ["Votorantim", "Salto de Pirapora", "Piedade", "Pilar do Sul"] },
  { key: "itu", name: "André Fonseca", vanModel: "Iveco Daily", capacity: 16, departureTime: "16:50", rating: 4.7, cities: ["Itu", "Salto"] },
  { key: "portofeliz", name: "Beatriz Campos", vanModel: "Fiat Ducato", capacity: 14, departureTime: "16:40", rating: 4.8, cities: ["Porto Feliz", "Boituva", "Cerquilho", "Tietê"] },
  { key: "tatui", name: "Rogério Lima", vanModel: "Renault Master", capacity: 15, departureTime: "16:45", rating: 4.7, cities: ["Tatuí", "Capela do Alto", "Iperó", "Araçoiaba da Serra"] },
  { key: "itapetininga", name: "Helena Duarte", vanModel: "Mercedes Sprinter", capacity: 16, departureTime: "16:20", rating: 4.8, cities: ["Itapetininga", "Alambari", "Sarapuí"] },
  { key: "saoroque", name: "Gustavo Pires", vanModel: "Peugeot Boxer", capacity: 14, departureTime: "16:50", rating: 4.6, cities: ["São Roque", "Mairinque", "Alumínio"] },
];

// Contas de demonstração (vans e alunos) usam este domínio
function isDemoEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${DEMO_VAN_DOMAIN}`);
}

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

// Conexão normal ou uma transação aberta: as duas executam SQL do mesmo jeito
type Executor = Pick<Client, "execute">;

function createRepository(db: Client) {
  // Converte as linhas do libSQL em objetos simples (sem as chaves numéricas)
  async function all<T>(sql: string, args: InValue[] = [], q: Executor = db): Promise<T[]> {
    const { columns, rows } = await q.execute({ sql, args });
    return rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])) as T);
  }

  async function get<T>(sql: string, args: InValue[] = [], q: Executor = db): Promise<T | undefined> {
    return (await all<T>(sql, args, q))[0];
  }

  async function run(sql: string, args: InValue[] = [], q: Executor = db): Promise<number> {
    return Number((await q.execute({ sql, args })).lastInsertRowid ?? 0);
  }

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
    const college = typeof nameOrId === "number"
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

  async function insertOrConflict(sql: string, args: InValue[], conflictMessage: string, q: Executor = db): Promise<number> {
    try {
      return await run(sql, args, q);
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) throw new ApiError(409, conflictMessage);
      throw error;
    }
  }

  const driverSummarySql = `
    SELECT d.id, d.name, d.phone, d.email, d.van_model AS vanModel, d.plate, d.capacity,
           d.departure_time AS departureTime, d.return_time AS returnTime, d.rating, d.subscription_until AS subscriptionUntil,
           (SELECT COUNT(*) FROM bookings b WHERE b.driver_id = d.id AND b.status <> 'Cancelado') AS occupied,
           (SELECT group_concat(city, ',') FROM (SELECT city FROM driver_cities WHERE driver_id = d.id ORDER BY position)) AS cities,
           (SELECT group_concat(c.name, ',') FROM driver_colleges dc JOIN colleges c ON c.id = dc.college_id WHERE dc.driver_id = d.id) AS colleges
    FROM drivers d`;

  function toDriver(row: DriverRow): Driver {
    return {
      ...row,
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
    const student = await get<Student>(`
      SELECT s.id, s.name, s.phone, s.email, s.address, c.id AS collegeId, c.name AS college
      FROM students s JOIN colleges c ON c.id = s.college_id WHERE s.id = ?`, [id], q);
    if (!student) throw new ApiError(404, "Estudante não encontrado.");
    return student;
  }

  async function driversForCollege(collegeId: number): Promise<Driver[]> {
    const rows = await all<DriverRow>(`${driverSummarySql}
      WHERE d.id IN (SELECT driver_id FROM driver_colleges WHERE college_id = ?)
      ORDER BY d.rating DESC, d.departure_time`, [collegeId]);
    return rows.map(toDriver).filter((driver) => driver.subscriptionActive);
  }

  async function getBooking(id: number): Promise<Booking> {
    const booking = await get<Booking>("SELECT id, status, pickup, pickup_time AS pickupTime FROM bookings WHERE id = ?", [id]);
    if (!booking) throw new ApiError(404, "Reserva não encontrada.");
    return booking;
  }

  // Cria um aviso para o sino do painel
  async function notify(user: SessionUser, title: string, body: string, q: Executor = db): Promise<void> {
    await run("INSERT INTO notifications (profile, user_id, title, body) VALUES (?, ?, ?, ?)", [user.profile, user.id, title, body], q);
  }

  // Reserva que vale para o estudante: a confirmada, ou a mais recente aguardando
  function activeBooking(studentId: number) {
    return get<{ id: number; driverId: number; pickup: string; pickupTime: string | null; status: BookingStatus }>(`
      SELECT id, driver_id AS driverId, pickup, pickup_time AS pickupTime, status FROM bookings
      WHERE student_id = ? AND status <> 'Cancelado'
      ORDER BY status = 'Confirmado' DESC, created_at DESC, id DESC LIMIT 1`, [studentId]);
  }

  // Passageiros da van com a presença do dia (null = ainda não respondeu). Os alunos de demonstração
  // vão todo dia, a menos que a presença deles seja registrada. `point` = posição do endereço, se conhecida.
  async function passengersOf(driverId: number, day: string): Promise<Rider[]> {
    const rows = await all<Omit<Passenger, "going"> & { going: number | null; lat: number | null; lng: number | null; home: string }>(`
      SELECT b.id AS bookingId, s.id AS studentId, s.name, b.pickup, b.pickup_time AS pickupTime, c.name AS college, b.status,
             s.lat, s.lng, s.address AS home,
             coalesce((SELECT a.going FROM attendance a WHERE a.student_id = s.id AND a.driver_id = b.driver_id AND a.day = ?),
                      CASE WHEN s.email LIKE ? THEN 1 END) AS going
      FROM bookings b
      JOIN students s ON s.id = b.student_id
      JOIN colleges c ON c.id = s.college_id
      WHERE b.driver_id = ? AND b.status <> 'Cancelado'
      ORDER BY coalesce(b.pickup_time, '99:99'), b.created_at, b.id`, [day, `%@${DEMO_VAN_DOMAIN}`, driverId]);
    return rows.map(({ lat, lng, home, going, ...row }) => ({
      ...row,
      going: going === null ? null : Boolean(going),
      point: lat !== null && lng !== null ? { lat, lng } : approximatePoint(row.pickup) ?? approximatePoint(home),
      // para o Google Maps: a posição guardada, ou o endereço em texto
      mapsQuery: lat !== null && lng !== null ? `${lat},${lng}` : row.pickup,
    }));
  }

  async function routeRuns(driverId: number, day: string): Promise<Partial<Record<Leg, Date>>> {
    const rows = await all<{ leg: Leg; startedAt: string }>(
      "SELECT leg, started_at AS startedAt FROM route_runs WHERE driver_id = ? AND day = ?", [driverId, day]);
    return Object.fromEntries(rows.map((row) => [row.leg, fromSqlTime(row.startedAt)]));
  }

  function scheduledTime(driver: Driver, leg: Leg): string | null {
    return leg === "ida" ? driver.departureTime : driver.returnTime;
  }

  // Rota de uma viagem com quem vai hoje, calculada pelos endereços (ver route.ts).
  // Ida: sai da primeira cidade da van, pega os estudantes e termina na faculdade.
  // Volta: sai da faculdade e deixa cada estudante em casa.
  function planLeg(driver: Driver, leg: Leg, riders: Rider[]): { plan: RoutePlan; destination: string | null } | null {
    if (riders.length === 0) return null;
    const counts = new Map<string, number>();
    for (const rider of riders) counts.set(rider.college, (counts.get(rider.college) ?? 0) + 1);
    const destination = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? driver.colleges[0] ?? null;
    const college: Point | null = destination ? collegePoint(destination) : null;
    const cityPoints = driver.cities.map((city) => placePoint(city)).filter((point): point is Point => point !== null);
    const start: Point | null = cityPoints[0] ?? null;
    // endereço que não conseguimos localizar: assume um ponto no meio da área que a van atende
    const area: Point | null = cityPoints.length === 0 ? null
      : { lat: cityPoints.reduce((t, p) => t + p.lat, 0) / cityPoints.length, lng: cityPoints.reduce((t, p) => t + p.lng, 0) / cityPoints.length };
    const stops = riders.map((rider) => ({ id: rider.studentId, point: rider.point ?? area }));
    const plan = leg === "ida" ? planRoute(start, stops, college) : planRoute(college, stops);
    return { plan, destination };
  }

  // Horário (HH:MM) em que a van chega a um ponto da rota: conta a partir da saída real
  // ou, se ainda não saiu, do horário programado (previsão).
  function clockAt(started: Date | undefined, scheduled: string | null, minutes: number): { time: string; predicted: boolean } | null {
    if (started) return { time: localTime(addMinutes(started, minutes)), predicted: false };
    return scheduled ? { time: clockPlus(scheduled, minutes), predicted: true } : null;
  }

  const triedLocating = new Set<number>();

  const repo = {
    listColleges(): Promise<College[]> {
      return all<College>("SELECT id, name FROM colleges ORDER BY name");
    },

    async createStudent(data: StudentInput): Promise<Student> {
      const input = data as Record<string, unknown>;
      const college = await findCollege(typeof data.college === "number" ? data.college : text(input, "college"));
      const id = await insertOrConflict(
        "INSERT INTO students (name, phone, email, address, college_id, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
        [text(input, "name"), text(input, "phone"), text(input, "email"), text(input, "address"), college.id, data.passwordHash ?? null],
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
      if (returnTime && !timePattern.test(returnTime)) throw new ApiError(400, "Horário de volta inválido (use HH:MM).");
      const rating = data.rating === undefined ? 5 : Number(data.rating);
      if (!(rating >= 0 && rating <= 5)) throw new ApiError(400, "Nota inválida (use de 0 a 5).");

      const id = await transaction(async (tx) => {
        const driverId = await insertOrConflict(
          `INSERT INTO drivers (name, phone, email, van_model, plate, capacity, departure_time, return_time, rating, password_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [fields.name, fields.phone, fields.email, fields.vanModel, fields.plate, capacity, departureTime, returnTime, rating, data.passwordHash ?? null],
          "Já existe um motorista com este e-mail ou placa.",
          tx,
        );
        for (const [index, city] of cities.entries()) {
          await run("INSERT INTO driver_cities (driver_id, position, city) VALUES (?, ?, ?)", [driverId, index, city], tx);
        }
        for (const name of colleges) {
          const college = await findOrCreateCollege(name, tx);
          await run("INSERT OR IGNORE INTO driver_colleges (driver_id, college_id) VALUES (?, ?)", [driverId, college.id], tx);
        }
        return driverId;
      });
      return getDriver(id);
    },

    getDriver: (id: number) => getDriver(id),

    // Busca da página inicial: quantas vans atendem a faculdade escolhida
    async searchRoutes(data: { address?: string; college?: string }): Promise<{ college: string; count: number }> {
      const input = data as Record<string, unknown>;
      const address = text(input, "address");
      const found = await findCollege(text(input, "college"));
      const drivers = await driversForCollege(found.id);
      await run("INSERT INTO searches (address, college_id, results) VALUES (?, ?, ?)", [address, found.id, drivers.length]);
      return { college: found.name, count: drivers.length };
    },

    // Vans disponíveis para um estudante (ou para uma faculdade)
    async listVans({ studentId, college }: { studentId?: number; college?: string }): Promise<Van[]> {
      let target: College | undefined;
      let bookedDriverIds = new Set<number>();
      if (studentId) {
        const student = await getStudent(studentId);
        target = { id: student.collegeId, name: student.college };
        const booked = await all<{ driver_id: number }>(
          "SELECT driver_id FROM bookings WHERE student_id = ? AND status <> 'Cancelado'", [studentId]);
        bookedDriverIds = new Set(booked.map((row) => row.driver_id));
      } else if (college) {
        target = await findCollege(college);
      }
      const drivers = target
        ? await driversForCollege(target.id)
        : (await all<DriverRow>(`${driverSummarySql} ORDER BY d.rating DESC`)).map(toDriver).filter((driver) => driver.subscriptionActive);
      return drivers.map((driver) => ({
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
      }));
    },

    // Detalhes de uma van para o estudante logado (o telefone só aparece depois da reserva)
    async vanDetail(driverId: number, studentId: number): Promise<VanDetail> {
      const student = await getStudent(studentId);
      const driver = await getDriver(driverId);
      if (!driver.colleges.some((name) => name.toLowerCase() === student.college.toLowerCase())) {
        throw new ApiError(404, "Esta van não atende a sua faculdade.");
      }
      const active = await all<{ id: number; driverId: number; status: BookingStatus; driver: string }>(`
        SELECT b.id, b.driver_id AS driverId, b.status, d.name AS driver FROM bookings b JOIN drivers d ON d.id = b.driver_id
        WHERE b.student_id = ? AND b.status <> 'Cancelado' ORDER BY b.id DESC`, [studentId]);
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
        bookingId: mine?.id ?? null,
        bookingStatus: mine?.status ?? null,
        current: !mine && other ? { driverId: other.driverId, driver: other.driver, bookingId: other.id } : null,
      };
    },

    // Estudante desiste da própria vaga
    async cancelBooking(studentId: number, bookingId: number): Promise<{ id: number; status: BookingStatus }> {
      return transaction(async (tx) => {
        const booking = await get<{ studentId: number; driverId: number; status: BookingStatus }>(
          "SELECT student_id AS studentId, driver_id AS driverId, status FROM bookings WHERE id = ?", [bookingId], tx);
        if (!booking) throw new ApiError(404, "Reserva não encontrada.");
        if (booking.studentId !== studentId) throw new ApiError(403, "Você não tem permissão para acessar estes dados.");
        if (booking.status === "Cancelado") throw new ApiError(409, "Esta reserva já foi cancelada.");
        await run("UPDATE bookings SET status = 'Cancelado' WHERE id = ?", [bookingId], tx);
        const student = await getStudent(studentId, tx);
        await notify({ profile: "driver", id: booking.driverId }, "Vaga liberada", `${student.name} cancelou a reserva e saiu da sua van.`, tx);
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
      await run("UPDATE drivers SET subscription_until = ?, subscription_notice = NULL WHERE id = ?", [until, driverId]);
      await notify({ profile: "driver", id: driverId }, "Assinatura ativa",
        `Pagamento simulado confirmado. Sua van está liberada para os alunos até ${until.split("-").reverse().join("/")}.`);
      return repo.subscription(driverId, now);
    },

    // Avisa o motorista perto do vencimento e quando venceu (uma vez por validade)
    async checkSubscriptionNotices(driverId: number, now = new Date()): Promise<void> {
      const config = subscriptionConfig();
      const row = await get<{ email: string; until: string | null; notice: string | null }>(
        "SELECT email, subscription_until AS until, subscription_notice AS notice FROM drivers WHERE id = ?", [driverId]);
      if (!config.enabled || !row || isDemoEmail(row.email)) return;
      const info = subscriptionInfo(row.until, localDay(now), false, config);
      const price = `R$ ${config.price.toFixed(2).replace(".", ",")}`;
      let notice: string | null = null;
      if (row.until === null) {
        notice = "none";
        if (row.notice !== notice) {
          await notify({ profile: "driver", id: driverId }, "Assine para liberar sua van",
            `Sua conta está criada, mas sua van só aparece para os alunos com a assinatura em dia (${price} por mês). Assine no painel.`);
        }
      } else if (!info.active) {
        notice = `${row.until}:expired`;
        if (row.notice !== notice) {
          await notify({ profile: "driver", id: driverId }, "Assinatura vencida",
            `Sua assinatura venceu em ${row.until.split("-").reverse().join("/")} e sua van ficou oculta para novos alunos. Renove no painel.`);
        }
      } else if (info.daysLeft !== null && info.daysLeft <= config.warnDays) {
        notice = `${row.until}:soon`;
        if (row.notice !== notice) {
          await notify({ profile: "driver", id: driverId }, "Assinatura perto de vencer",
            info.daysLeft === 0 ? "Sua assinatura vence hoje. Renove no painel para não perder novos alunos."
              : `Sua assinatura vence em ${info.daysLeft} ${info.daysLeft === 1 ? "dia" : "dias"}. Renove no painel para não perder novos alunos.`);
        }
      }
      if (notice !== null && notice !== row.notice) await run("UPDATE drivers SET subscription_notice = ? WHERE id = ?", [notice, driverId]);
    },

    // Painel do motorista: dados da rota, lista de embarque e quem vai hoje
    async driverDashboard(driverId: number, now = new Date()): Promise<{ driver: Driver; passengers: Passenger[]; mainDestination: string; today: DriverToday; subscription: SubscriptionInfo }> {
      await repo.checkSubscriptionNotices(driverId, now);
      const driver = await getDriver(driverId);
      const day = localDay(now);
      const riders = await passengersOf(driverId, day);
      const passengers: Passenger[] = riders.map(({ point: _point, mapsQuery: _query, ...passenger }) => passenger);
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
          const started = runs[leg];
          const scheduled = scheduledTime(driver, leg);
          const planned = planLeg(driver, leg, riders.filter((r) => r.going === true));
          let route: LegRoute | null = null;
          let predicted = false;
          if (planned) {
            const names = new Map(riders.map((r) => [r.studentId, r]));
            const stops = planned.plan.stops.map((stop) => {
              const rider = names.get(stop.id)!;
              const at = clockAt(started, scheduled, stop.minutes);
              predicted = at?.predicted ?? false;
              return { studentId: rider.studentId, name: rider.name, pickup: rider.pickup, order: stop.order, eta: at?.time ?? null };
            });
            const end = clockAt(started, scheduled, planned.plan.totalMinutes);
            // ida: parte da posição do motorista, passa pelos alunos e termina na faculdade; volta: sai da faculdade
            const college = planned.destination ? collegeSearch(planned.destination) : null;
            const stopQueries = planned.plan.stops.map((stop) => names.get(stop.id)!.mapsQuery);
            const links = mapsLinks(stopQueries, leg === "ida" ? { destination: college } : { origin: college });
            route = { destination: planned.destination, totalMinutes: planned.plan.totalMinutes, distanceKm: planned.plan.distanceKm, arrival: end?.time ?? null, stops, mapsLinks: links };
          }
          return { leg, scheduled, startedAt: started ? localTime(started) : null, eta: null, predicted, route };
        }),
      };
      return { driver, passengers, mainDestination, today, subscription: subscriptionInfo(driver.subscriptionUntil, day, isDemoEmail(driver.email)) };
    },

    // Descobre a posição do endereço do estudante (uma tentativa por execução do servidor; falhou, usa a aproximação)
    async locateStudent(studentId: number, locate: (address: string) => Promise<Point | null> = geocode): Promise<void> {
      if (triedLocating.has(studentId)) return;
      const row = await get<{ lat: number | null; email: string; address: string }>("SELECT lat, email, address FROM students WHERE id = ?", [studentId]);
      if (!row || row.lat !== null || row.email.toLowerCase().endsWith(`@${DEMO_VAN_DOMAIN}`)) return;
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
        return { ...base, going: null, van: null, legs: legs.map((leg) => ({ leg, scheduled: null, startedAt: null, eta: null, predicted: false })) };
      }
      const driver = await getDriver(booking.driverId);
      const passengers = await passengersOf(driver.id, day);
      const riders = passengers.filter((p) => p.going === true);
      const going = passengers.find((p) => p.studentId === studentId)?.going ?? null;
      const runs = await routeRuns(driver.id, day);
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
          const started = runs[leg];
          const scheduled = scheduledTime(driver, leg);
          const planned = going === true ? planLeg(driver, leg, riders) : null;
          const minutes = planned?.plan.stops.find((stop) => stop.id === studentId)?.minutes;
          const at = minutes === undefined ? null : clockAt(started, scheduled, minutes);
          const ride = minutes === undefined ? null : leg === "ida" ? planned!.plan.totalMinutes - minutes : minutes;
          return { leg, scheduled, startedAt: started ? localTime(started) : null, eta: at?.time ?? null, predicted: at?.predicted ?? false, rideMinutes: ride };
        }),
      };
    },

    // Estudante avisa se vai hoje; ele e o motorista recebem um aviso
    async setAttendance(studentId: number, going: unknown, now = new Date()): Promise<StudentToday> {
      if (typeof going !== "boolean") throw new ApiError(400, "Informe se você vai hoje (going: true ou false).");
      const booking = await activeBooking(studentId);
      if (!booking) throw new ApiError(409, "Reserve uma vaga numa van para confirmar presença.");
      const day = localDay(now);
      const previous = await get<{ going: number }>("SELECT going FROM attendance WHERE student_id = ? AND day = ?", [studentId, day]);
      await run(`INSERT INTO attendance (student_id, driver_id, day, going) VALUES (?, ?, ?, ?)
                 ON CONFLICT (student_id, day) DO UPDATE SET driver_id = excluded.driver_id, going = excluded.going, updated_at = datetime('now')`,
        [studentId, booking.driverId, day, going ? 1 : 0]);
      if (!previous || Boolean(previous.going) !== going) {
        const student = await getStudent(studentId);
        const firstName = student.name.split(" ")[0];
        await notify({ profile: "student", id: studentId },
          going ? "Presença confirmada" : "Ausência registrada",
          going ? "Presença confirmada: você vai hoje. O motorista já sabe." : "Você avisou que não vai hoje. O motorista não vai passar no seu ponto.");
        await notify({ profile: "driver", id: booking.driverId },
          going ? `${firstName} vai hoje` : `${firstName} não vai hoje`,
          `${student.name} ${going ? "confirmou presença" : "avisou que não vai"} hoje (${weekdayOf(day).toLowerCase()}). Embarque: ${booking.pickup}.`);
      }
      return repo.studentToday(studentId, now);
    },

    // Motorista inicia a ida ou a volta: quem vai hoje recebe a previsão de chegada
    async startRoute(driverId: number, leg: unknown, now = new Date()): Promise<DriverToday> {
      if (leg !== "ida" && leg !== "volta") throw new ApiError(400, "Escolha a viagem: ida ou volta.");
      const day = localDay(now);
      const startedAt = now.toISOString().slice(0, 19).replace("T", " ");
      await insertOrConflict("INSERT INTO route_runs (driver_id, day, leg, started_at) VALUES (?, ?, ?, ?)",
        [driverId, day, leg, startedAt], leg === "ida" ? "Você já iniciou a ida de hoje." : "Você já iniciou a volta de hoje.");
      const riders = (await passengersOf(driverId, day)).filter((p) => p.going === true);
      const planned = planLeg(await getDriver(driverId), leg, riders);
      for (const rider of riders) {
        const minutes = planned!.plan.stops.find((stop) => stop.id === rider.studentId)!.minutes;
        const eta = localTime(addMinutes(now, minutes));
        await notify({ profile: "student", id: rider.studentId },
          leg === "ida" ? "A van saiu para te buscar" : "A van saiu da faculdade",
          leg === "ida"
            ? `O motorista iniciou a rota às ${localTime(now)}. Previsão no seu ponto (${rider.pickup}): ${eta}.`
            : `O motorista iniciou a volta às ${localTime(now)}. Previsão de chegada em casa: ${eta}.`);
      }
      return (await repo.driverDashboard(driverId, now)).today;
    },

    // Últimos avisos do usuário logado
    async notifications(user: SessionUser): Promise<{ unread: number; items: Notification[] }> {
      if (user.profile === "driver") await repo.checkSubscriptionNotices(user.id);
      const rows = await all<{ id: number; title: string; body: string; createdAt: string; readAt: string | null }>(`
        SELECT id, title, body, created_at AS createdAt, read_at AS readAt FROM notifications
        WHERE profile = ? AND user_id = ? ORDER BY id DESC LIMIT 30`, [user.profile, user.id]);
      const { unread } = (await get<{ unread: number }>(
        "SELECT COUNT(*) AS unread FROM notifications WHERE profile = ? AND user_id = ? AND read_at IS NULL", [user.profile, user.id]))!;
      return {
        unread,
        items: rows.map((row) => ({ id: row.id, title: row.title, body: row.body, createdAt: fromSqlTime(row.createdAt).toISOString(), read: row.readAt !== null })),
      };
    },

    async markNotificationsRead(user: SessionUser): Promise<{ ok: true }> {
      await run("UPDATE notifications SET read_at = datetime('now') WHERE profile = ? AND user_id = ? AND read_at IS NULL", [user.profile, user.id]);
      return { ok: true };
    },

    // Cada estudante fica em uma van só: com `replace`, a reserva atual é cancelada e a nova entra no lugar
    createBooking(data: { studentId?: number | string; driverId?: number | string; replace?: unknown }): Promise<{ id: number; status: BookingStatus }> {
      const input = data as Record<string, unknown>;
      const studentId = Number(text(input, "studentId"));
      const driverId = Number(text(input, "driverId"));
      return transaction(async (tx) => {
        const student = await getStudent(studentId, tx);
        const driver = await getDriver(driverId, tx);
        const existing = await get<{ id: number; status: BookingStatus }>(
          "SELECT id, status FROM bookings WHERE student_id = ? AND driver_id = ?", [student.id, driver.id], tx);
        if (existing && existing.status !== "Cancelado") throw new ApiError(409, "Você já reservou uma vaga nesta van.");
        if (!driver.subscriptionActive) throw new ApiError(409, "Esta van não está recebendo novas reservas no momento.");
        if (driver.freeSeats <= 0) throw new ApiError(409, "Esta van não tem vagas livres.");
        const others = await all<{ id: number; driverId: number }>(
          "SELECT id, driver_id AS driverId FROM bookings WHERE student_id = ? AND driver_id <> ? AND status <> 'Cancelado'", [student.id, driver.id], tx);
        if (others.length > 0) {
          if (data.replace !== true) {
            throw new ApiError(409, "Você já escolheu uma van. Cancele a reserva atual ou troque de van para escolher esta.");
          }
          for (const other of others) {
            await run("UPDATE bookings SET status = 'Cancelado' WHERE id = ?", [other.id], tx);
            await notify({ profile: "driver", id: other.driverId }, "Vaga liberada", `${student.name} trocou de van e saiu da sua rota.`, tx);
          }
        }
        await notify({ profile: "driver", id: driver.id }, "Nova reserva", `${student.name} reservou uma vaga na sua van. Confirme ou recuse no painel.`, tx);
        if (existing) {
          await run("UPDATE bookings SET status = 'Aguardando', pickup = ? WHERE id = ?", [student.address, existing.id], tx);
          return { id: existing.id, status: "Aguardando" as const };
        }
        const id = await run("INSERT INTO bookings (student_id, driver_id, pickup) VALUES (?, ?, ?)",
          [student.id, driver.id, student.address], tx);
        return { id, status: "Aguardando" as const };
      });
    },

    async updateBooking(id: number, { status, pickupTime }: { status?: string; pickupTime?: string | null }): Promise<Booking> {
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
          "SELECT b.student_id AS studentId, d.name AS driver FROM bookings b JOIN drivers d ON d.id = b.driver_id WHERE b.id = ?", [id]))!;
        await notify({ profile: "student", id: row.studentId },
          status === "Confirmado" ? "Reserva confirmada" : "Reserva recusada",
          status === "Confirmado"
            ? `${row.driver} confirmou sua vaga. Agora é só avisar no painel, todo dia, se você vai.`
            : `${row.driver} não pôde confirmar sua vaga. Procure outra van no painel.`);
      }
      if (pickupTime !== undefined) await run("UPDATE bookings SET pickup_time = ? WHERE id = ?", [pickupTime, id]);
      return getBooking(id);
    },

    // Conta usada no login (o e-mail é único dentro de cada perfil)
    findAccount(profile: "student" | "driver", email: string): Promise<{ id: number; name: string; passwordHash: string | null } | undefined> {
      const table = profile === "student" ? "students" : "drivers";
      return get(`SELECT id, name, password_hash AS passwordHash FROM ${table} WHERE email = ?`, [email.trim()]);
    },

    async accountName(user: SessionUser): Promise<string> {
      if (user.profile === "admin") return "Administrador";
      return (user.profile === "student" ? await getStudent(user.id) : await getDriver(user.id)).name;
    },

    async createSession(tokenHash: string, user: SessionUser, days: number): Promise<void> {
      await run("DELETE FROM sessions WHERE expires_at <= datetime('now')");
      await run(`INSERT INTO sessions (token_hash, profile, user_id, expires_at)
                 VALUES (?, ?, ?, datetime('now', ?))`, [tokenHash, user.profile, user.id, `+${days} days`]);
    },

    // Sessão válida (não expirada e de uma conta que ainda existe)
    getSession(tokenHash: string): Promise<SessionUser | undefined> {
      return get<{ profile: Profile; id: number }>(`
        SELECT se.profile, se.user_id AS id FROM sessions se
        WHERE se.token_hash = ? AND se.expires_at > datetime('now')
          AND (se.profile = 'admin'
            OR (se.profile = 'student' AND EXISTS (SELECT 1 FROM students WHERE id = se.user_id))
            OR (se.profile = 'driver' AND EXISTS (SELECT 1 FROM drivers WHERE id = se.user_id)))`, [tokenHash]);
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
        `${driverSummarySql.replace("d.rating,", "d.rating, d.created_at AS createdAt,")} ORDER BY d.id DESC`);
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
          return { ...driver, cities: driver.cities.join(", "), colleges: driver.colleges.join(", "), createdAt: row.createdAt };
        }),
        bookings: await all<Record<string, unknown>>(`
          SELECT b.id, s.name AS student, d.name AS driver, b.pickup, b.pickup_time AS pickupTime, b.status, b.created_at AS createdAt
          FROM bookings b JOIN students s ON s.id = b.student_id JOIN drivers d ON d.id = b.driver_id ORDER BY b.id DESC`),
        attendance: (await all<Record<string, unknown>>(`
          SELECT a.day, s.name AS student, d.name AS driver, a.going, a.updated_at AS createdAt
          FROM attendance a JOIN students s ON s.id = a.student_id JOIN drivers d ON d.id = a.driver_id
          ORDER BY a.day DESC, a.updated_at DESC LIMIT 500`)).map((row, index) => ({ ...row, id: index + 1, going: row.going ? "Vai" : "Não vai" })),
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
        await notify({ profile: "driver", id: row.driverId }, "Vaga liberada", `${row.name} ficou em uma van só e saiu da sua rota.`);
        await notify({ profile: "student", id: row.studentId }, "Uma van por aluno",
          "Você tinha mais de uma van reservada. Mantivemos a reserva confirmada (ou a mais recente) e cancelamos as outras.");
      }
      await run("CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_booking_per_student ON bookings(student_id) WHERE status <> 'Cancelado'");
    },

    // Senha (hash) da conta logada, para confirmar a exclusão
    async passwordHashOf(user: SessionUser): Promise<string | null> {
      const table = user.profile === "student" ? "students" : "drivers";
      return (await get<{ hash: string | null }>(`SELECT password_hash AS hash FROM ${table} WHERE id = ?`, [user.id]))?.hash ?? null;
    },

    // Exclui a conta e tudo o que depende dela (reservas, presenças, avisos e sessões)
    async deleteAccount(user: SessionUser): Promise<{ ok: true }> {
      if (user.profile === "admin") throw new ApiError(403, "Esta conta não pode ser excluída.");
      await transaction(async (tx) => {
        if (user.profile === "student") {
          const driverIds = await all<{ driverId: number }>(
            "SELECT DISTINCT driver_id AS driverId FROM bookings WHERE student_id = ? AND status <> 'Cancelado'", [user.id], tx);
          const student = await getStudent(user.id, tx);
          for (const { driverId } of driverIds) {
            await notify({ profile: "driver", id: driverId }, "Vaga liberada", `${student.name} excluiu a conta e saiu da sua van.`, tx);
          }
          for (const table of ["attendance", "bookings"]) await run(`DELETE FROM ${table} WHERE student_id = ?`, [user.id], tx);
          await run("DELETE FROM students WHERE id = ?", [user.id], tx);
        } else {
          const riders = await all<{ studentId: number }>(
            "SELECT DISTINCT student_id AS studentId FROM bookings WHERE driver_id = ? AND status <> 'Cancelado'", [user.id], tx);
          const driver = await getDriver(user.id, tx);
          for (const { studentId } of riders) {
            await notify({ profile: "student", id: studentId }, "Van encerrada", `${driver.name} excluiu a conta. Escolha outra van no painel.`, tx);
          }
          for (const table of ["attendance", "route_runs", "bookings", "driver_cities", "driver_colleges"]) {
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
    // (em qualquer banco, mesmo com SEED=false). Idempotente: ignora as que já existem.
    async ensureColleges(): Promise<void> {
      for (const name of defaultColleges) await run("INSERT OR IGNORE INTO colleges (name) VALUES (?)", [name]);
    },

    // Motoristas e passageiros de exemplo (com a senha pública DEMO_PASSWORD), só em banco vazio
    async seedDemoData(): Promise<void> {
      const { total } = (await get<{ total: number }>(
        "SELECT (SELECT COUNT(*) FROM drivers) + (SELECT COUNT(*) FROM students) AS total"))!;
      if (total > 0) return;
      try {
        await insertDemoData();
      } catch (error) {
        // duas instâncias subindo juntas: a outra já criou os exemplos
        if (!(error instanceof ApiError && error.status === 409)) throw error;
      }
    },

    // Cria as vans de demonstração que faltam e liga todas a todas as faculdades
    // (inclusive faculdades cadastradas depois). Idempotente. Com enabled=false, apaga as vans.
    async syncDemoVans(enabled: boolean): Promise<void> {
      const demoEmail = `%@${DEMO_VAN_DOMAIN}`;
      if (!enabled) {
        await transaction(async (tx) => {
          const demoIds = "SELECT id FROM drivers WHERE email LIKE ?";
          for (const table of ["bookings", "attendance", "route_runs", "driver_cities", "driver_colleges"]) {
            await run(`DELETE FROM ${table} WHERE driver_id IN (${demoIds})`, [demoEmail], tx);
          }
          for (const table of ["sessions", "notifications"]) {
            await run(`DELETE FROM ${table} WHERE profile = 'driver' AND user_id IN (${demoIds})`, [demoEmail], tx);
          }
          await run("DELETE FROM drivers WHERE email LIKE ?", [demoEmail], tx);
          // alunos de demonstração (as reservas deles na van já foram apagadas acima)
          const demoStudentIds = "SELECT id FROM students WHERE email LIKE ?";
          await run(`DELETE FROM attendance WHERE student_id IN (${demoStudentIds})`, [demoEmail], tx);
          await run(`DELETE FROM bookings WHERE student_id IN (${demoStudentIds})`, [demoEmail], tx);
          await run(`DELETE FROM notifications WHERE profile = 'student' AND user_id IN (${demoStudentIds})`, [demoEmail], tx);
          await run("DELETE FROM students WHERE email LIKE ?", [demoEmail], tx);
        });
        return;
      }
      const existing = new Set((await all<{ email: string }>(
        "SELECT email FROM drivers WHERE email LIKE ?", [demoEmail])).map((row) => row.email.toLowerCase()));
      for (const [index, van] of demoVans.entries()) {
        const email = `van-${van.key}@${DEMO_VAN_DOMAIN}`;
        if (existing.has(email)) continue;
        const number = String(index + 1).padStart(2, "0");
        try {
          await repo.createDriver({
            name: `${van.name} (demo)`, phone: `(15) 90000-00${number}`, email, vanModel: van.vanModel,
            plate: `DEM-${number[0]}A${number}`, capacity: van.capacity, departureTime: van.departureTime,
            returnTime: DEMO_RETURN_TIME, rating: van.rating, cities: van.cities, colleges: defaultColleges,
            // sem passwordHash: a conta não tem senha e o login sempre falha
          });
        } catch (error) {
          // duas instâncias subindo juntas: a outra já criou esta van
          if (!(error instanceof ApiError && error.status === 409)) throw error;
        }
      }
      await run(`INSERT OR IGNORE INTO driver_colleges (driver_id, college_id)
                 SELECT d.id, c.id FROM drivers d, colleges c WHERE d.email LIKE ?`, [demoEmail]);
      // vans criadas antes do horário de volta existir
      await run("UPDATE drivers SET return_time = ? WHERE email LIKE ? AND return_time IS NULL", [DEMO_RETURN_TIME, demoEmail]);
      await repo.syncDemoStudents();
    },

    // Alunos fictícios dentro das vans de demonstração, com endereço e posição fixos. Idempotente.
    async syncDemoStudents(): Promise<void> {
      const demoEmail = `%@${DEMO_VAN_DOMAIN}`;
      const existing = new Set((await all<{ email: string }>(
        "SELECT email FROM students WHERE email LIKE ?", [demoEmail])).map((row) => row.email.toLowerCase()));
      for (const [key, students] of Object.entries(demoStudents)) {
        const driver = await get<{ id: number }>("SELECT id FROM drivers WHERE email = ?", [`van-${key}@${DEMO_VAN_DOMAIN}`]);
        if (!driver) continue;
        for (const [index, [name, address, lat, lng, college]] of students.entries()) {
          const email = `aluno-${key}-${index + 1}@${DEMO_VAN_DOMAIN}`;
          if (existing.has(email)) continue;
          try {
            // sem passwordHash: a conta não tem senha e o login sempre falha
            const student = await repo.createStudent({ name: `${name} (demo)`, phone: "(15) 90000-0000", email, address, college });
            await run("UPDATE students SET lat = ?, lng = ? WHERE id = ?", [lat, lng, student.id]);
            const booking = await repo.createBooking({ studentId: student.id, driverId: driver.id });
            await repo.updateBooking(booking.id, { status: "Confirmado" });
          } catch (error) {
            // duas instâncias subindo juntas, ou a van lotou: segue com os próximos
            if (!(error instanceof ApiError)) throw error;
          }
        }
      }
    },
  };

  async function insertDemoData(): Promise<void> {
    const passwordHash = hashPasswordSync(DEMO_PASSWORD);
    const carlos = await repo.createDriver({ name: "Carlos Eduardo", phone: "(15) 99999-0001", email: "carlos@rotau.com", vanModel: "Renault Master", plate: "ROT-1A01", capacity: 12, departureTime: "17:30", returnTime: "22:40", rating: 4.9, cities: "Centro, Sorocaba", colleges: "UniFacens, Fatec, Uniso, Unip", passwordHash });
    await repo.createDriver({ name: "Fernanda Lima", phone: "(15) 99999-0002", email: "fernanda@rotau.com", vanModel: "Mercedes Sprinter", plate: "ROT-2B02", capacity: 15, departureTime: "18:00", returnTime: "22:50", rating: 4.8, cities: "Zona Norte, Sorocaba", colleges: "Fatec, Ufscar", passwordHash });
    await repo.createDriver({ name: "Roberto Alves", phone: "(15) 99999-0003", email: "roberto@rotau.com", vanModel: "Fiat Ducato", plate: "ROT-3C03", capacity: 14, departureTime: "18:20", returnTime: "23:00", rating: 4.9, cities: "Jd. Europa, Sorocaba", colleges: "Uniso, UniFacens", passwordHash });
    // motoristas de exemplo com a assinatura sempre em dia
    await run("UPDATE drivers SET subscription_until = '2099-12-31'");
    const passengers: [string, string, string, string, string, BookingStatus][] = [
      ["Mariana Costa", "mariana@email.com", "Jd. Europa", "UniFacens", "17:40", "Confirmado"],
      ["Lucas Ribeiro", "lucas@email.com", "Vila Hortência", "Fatec", "17:55", "Confirmado"],
      ["Ana Beatriz", "ana@email.com", "Centro", "Uniso", "18:10", "Aguardando"],
      ["Pedro Martins", "pedro@email.com", "Jd. Faculdade", "Unip", "18:20", "Confirmado"],
    ];
    for (const [name, email, address, college, pickupTime, status] of passengers) {
      const student = await repo.createStudent({ name, email, address, college, phone: "(15) 98888-0000", passwordHash });
      const booking = await repo.createBooking({ studentId: student.id, driverId: carlos.id });
      await repo.updateBooking(booking.id, { status, pickupTime });
    }
  }

  return repo;
}
