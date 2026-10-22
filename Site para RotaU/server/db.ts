// Camada de acesso ao banco de dados do RotaU.
// Usa o SQLite embutido no Node (node:sqlite), sem dependências nativas.
import { DatabaseSync, type StatementSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

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
  rating: number;
  occupied: number;
  freeSeats: number;
  cities: string[];
  colleges: string[];
};

export type Van = {
  id: number;
  driver: string;
  vehicle: string;
  route: string;
  time: string;
  capacity: number;
  freeSeats: number;
  rating: number;
  booked: boolean;
};

export type Passenger = {
  bookingId: number;
  studentId: number;
  name: string;
  pickup: string;
  pickupTime: string | null;
  college: string;
  status: BookingStatus;
};

export type Booking = { id: number; status: BookingStatus; pickup: string; pickupTime: string | null };

export type StudentInput = { name?: string; phone?: string; email?: string; address?: string; college?: string | number };

export type DriverInput = {
  name?: string;
  phone?: string;
  email?: string;
  vanModel?: string;
  plate?: string;
  capacity?: number | string;
  departureTime?: string;
  rating?: number;
  cities?: string | string[];
  colleges?: string | string[];
};

type DriverRow = Omit<Driver, "cities" | "colleges" | "freeSeats"> & { cities: string | null; colleges: string | null };

export type Repository = ReturnType<typeof createRepository>;

export function openDatabase(file = process.env.DB_PATH ?? path.join(here, "data", "rotau.db")): Repository {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(readFileSync(path.join(here, "schema.sql"), "utf8"));
  const repo = createRepository(db);
  if (process.env.SEED !== "false") repo.seedIfEmpty();
  return repo;
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

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function createRepository(db: DatabaseSync) {
  function get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return db.prepare(sql).get(...params) as T | undefined;
  }

  function all<T>(sql: string, ...params: SQLInputValue[]): T[] {
    return db.prepare(sql).all(...params) as T[];
  }

  function transaction<T>(fn: () => T): T {
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function findCollege(nameOrId: string | number): College {
    const college = typeof nameOrId === "number"
      ? get<College>("SELECT id, name FROM colleges WHERE id = ?", nameOrId)
      : get<College>("SELECT id, name FROM colleges WHERE name = ?", nameOrId.trim());
    if (!college) throw new ApiError(400, `Faculdade "${nameOrId}" não encontrada.`);
    return college;
  }

  function findOrCreateCollege(name: string): College {
    const existing = get<College>("SELECT id, name FROM colleges WHERE name = ?", name);
    if (existing) return existing;
    const { lastInsertRowid } = db.prepare("INSERT INTO colleges (name) VALUES (?)").run(name);
    return { id: Number(lastInsertRowid), name };
  }

  function insertOrConflict(statement: StatementSync, params: SQLInputValue[], conflictMessage: string): number {
    try {
      return Number(statement.run(...params).lastInsertRowid);
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE")) throw new ApiError(409, conflictMessage);
      throw error;
    }
  }

  const driverSummarySql = `
    SELECT d.id, d.name, d.phone, d.email, d.van_model AS vanModel, d.plate, d.capacity,
           d.departure_time AS departureTime, d.rating,
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
    };
  }

  function getDriver(id: number): Driver {
    const row = get<DriverRow>(`${driverSummarySql} WHERE d.id = ?`, id);
    if (!row) throw new ApiError(404, "Motorista não encontrado.");
    return toDriver(row);
  }

  function getStudent(id: number): Student {
    const student = get<Student>(`
      SELECT s.id, s.name, s.phone, s.email, s.address, c.id AS collegeId, c.name AS college
      FROM students s JOIN colleges c ON c.id = s.college_id WHERE s.id = ?`, id);
    if (!student) throw new ApiError(404, "Estudante não encontrado.");
    return student;
  }

  function driversForCollege(collegeId: number): Driver[] {
    return all<DriverRow>(`${driverSummarySql}
      WHERE d.id IN (SELECT driver_id FROM driver_colleges WHERE college_id = ?)
      ORDER BY d.rating DESC, d.departure_time`, collegeId).map(toDriver);
  }

  function getBooking(id: number): Booking {
    const booking = get<Booking>("SELECT id, status, pickup, pickup_time AS pickupTime FROM bookings WHERE id = ?", id);
    if (!booking) throw new ApiError(404, "Reserva não encontrada.");
    return booking;
  }

  const repo = {
    listColleges(): College[] {
      return all<College>("SELECT id, name FROM colleges ORDER BY name");
    },

    createStudent(data: StudentInput): Student {
      const input = data as Record<string, unknown>;
      const college = findCollege(typeof data.college === "number" ? data.college : text(input, "college"));
      const id = insertOrConflict(
        db.prepare("INSERT INTO students (name, phone, email, address, college_id) VALUES (?, ?, ?, ?, ?)"),
        [text(input, "name"), text(input, "phone"), text(input, "email"), text(input, "address"), college.id],
        "Já existe um estudante com este e-mail.",
      );
      return getStudent(id);
    },

    getStudent,

    createDriver(data: DriverInput): Driver {
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
      const rating = data.rating === undefined ? 5 : Number(data.rating);
      if (!(rating >= 0 && rating <= 5)) throw new ApiError(400, "Nota inválida (use de 0 a 5).");

      const id = transaction(() => {
        const driverId = insertOrConflict(
          db.prepare(`INSERT INTO drivers (name, phone, email, van_model, plate, capacity, departure_time, rating)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
          [fields.name, fields.phone, fields.email, fields.vanModel, fields.plate, capacity, departureTime, rating],
          "Já existe um motorista com este e-mail ou placa.",
        );
        const addCity = db.prepare("INSERT INTO driver_cities (driver_id, position, city) VALUES (?, ?, ?)");
        cities.forEach((city, index) => addCity.run(driverId, index, city));
        const addCollege = db.prepare("INSERT OR IGNORE INTO driver_colleges (driver_id, college_id) VALUES (?, ?)");
        for (const name of colleges) addCollege.run(driverId, findOrCreateCollege(name).id);
        return driverId;
      });
      return getDriver(id);
    },

    getDriver,

    // Busca da página inicial: quantas vans atendem a faculdade escolhida
    searchRoutes(data: { address?: string; college?: string }): { college: string; count: number } {
      const input = data as Record<string, unknown>;
      const address = text(input, "address");
      const found = findCollege(text(input, "college"));
      const drivers = driversForCollege(found.id);
      db.prepare("INSERT INTO searches (address, college_id, results) VALUES (?, ?, ?)").run(address, found.id, drivers.length);
      return { college: found.name, count: drivers.length };
    },

    // Vans disponíveis para um estudante (ou para uma faculdade)
    listVans({ studentId, college }: { studentId?: number; college?: string }): Van[] {
      let target: College | undefined;
      let bookedDriverIds = new Set<number>();
      if (studentId) {
        const student = getStudent(studentId);
        target = { id: student.collegeId, name: student.college };
        bookedDriverIds = new Set(
          all<{ driver_id: number }>("SELECT driver_id FROM bookings WHERE student_id = ? AND status <> 'Cancelado'", studentId)
            .map((row) => row.driver_id),
        );
      } else if (college) {
        target = findCollege(college);
      }
      const drivers = target
        ? driversForCollege(target.id)
        : all<DriverRow>(`${driverSummarySql} ORDER BY d.rating DESC`).map(toDriver);
      return drivers.map((driver) => ({
        id: driver.id,
        driver: driver.name,
        vehicle: `${driver.vanModel} • ${driver.capacity} lugares`,
        route: `${driver.cities[0] ?? "—"} → ${target?.name ?? driver.colleges[0] ?? "—"}`,
        time: driver.departureTime,
        capacity: driver.capacity,
        freeSeats: driver.freeSeats,
        rating: driver.rating,
        booked: bookedDriverIds.has(driver.id),
      }));
    },

    // Painel do motorista: dados da rota e lista de embarque
    driverDashboard(driverId: number): { driver: Driver; passengers: Passenger[]; mainDestination: string } {
      const driver = getDriver(driverId);
      const passengers = all<Passenger>(`
        SELECT b.id AS bookingId, s.id AS studentId, s.name, b.pickup, b.pickup_time AS pickupTime, c.name AS college, b.status
        FROM bookings b
        JOIN students s ON s.id = b.student_id
        JOIN colleges c ON c.id = s.college_id
        WHERE b.driver_id = ? AND b.status <> 'Cancelado'
        ORDER BY coalesce(b.pickup_time, '99:99'), b.created_at`, driverId);
      const counts = new Map<string, number>();
      for (const passenger of passengers) counts.set(passenger.college, (counts.get(passenger.college) ?? 0) + 1);
      const mainDestination = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? driver.colleges[0] ?? "—";
      return { driver, passengers, mainDestination };
    },

    createBooking(data: { studentId?: number | string; driverId?: number | string }): { id: number; status: BookingStatus } {
      const input = data as Record<string, unknown>;
      const studentId = Number(text(input, "studentId"));
      const driverId = Number(text(input, "driverId"));
      return transaction(() => {
        const student = getStudent(studentId);
        const driver = getDriver(driverId);
        const existing = get<{ id: number; status: BookingStatus }>(
          "SELECT id, status FROM bookings WHERE student_id = ? AND driver_id = ?", student.id, driver.id);
        if (existing && existing.status !== "Cancelado") throw new ApiError(409, "Você já reservou uma vaga nesta van.");
        if (driver.freeSeats <= 0) throw new ApiError(409, "Esta van não tem vagas livres.");
        if (existing) {
          db.prepare("UPDATE bookings SET status = 'Aguardando', pickup = ? WHERE id = ?").run(student.address, existing.id);
          return { id: existing.id, status: "Aguardando" as const };
        }
        const { lastInsertRowid } = db.prepare("INSERT INTO bookings (student_id, driver_id, pickup) VALUES (?, ?, ?)")
          .run(student.id, driver.id, student.address);
        return { id: Number(lastInsertRowid), status: "Aguardando" as const };
      });
    },

    updateBooking(id: number, { status, pickupTime }: { status?: string; pickupTime?: string | null }): Booking {
      if (status !== undefined && !bookingStatuses.includes(status as BookingStatus)) {
        throw new ApiError(400, "Status inválido.");
      }
      if (pickupTime !== undefined && pickupTime !== null && !timePattern.test(pickupTime)) {
        throw new ApiError(400, "Horário de embarque inválido (use HH:MM).");
      }
      getBooking(id);
      if (status !== undefined) db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, id);
      if (pickupTime !== undefined) db.prepare("UPDATE bookings SET pickup_time = ? WHERE id = ?").run(pickupTime, id);
      return getBooking(id);
    },

    seedIfEmpty(): void {
      if (get<{ total: number }>("SELECT COUNT(*) AS total FROM colleges")!.total > 0) return;
      transaction(() => {
        const addCollege = db.prepare("INSERT INTO colleges (name) VALUES (?)");
        for (const name of ["UniFacens", "Fatec", "Ufscar", "Uniso", "Unip"]) addCollege.run(name);
      });
      const carlos = repo.createDriver({ name: "Carlos Eduardo", phone: "(15) 99999-0001", email: "carlos@rotau.com", vanModel: "Renault Master", plate: "ROT-1A01", capacity: 12, departureTime: "17:30", rating: 4.9, cities: "Centro, Sorocaba", colleges: "UniFacens, Fatec, Uniso, Unip" });
      repo.createDriver({ name: "Fernanda Lima", phone: "(15) 99999-0002", email: "fernanda@rotau.com", vanModel: "Mercedes Sprinter", plate: "ROT-2B02", capacity: 15, departureTime: "18:00", rating: 4.8, cities: "Zona Norte, Sorocaba", colleges: "Fatec, Ufscar" });
      repo.createDriver({ name: "Roberto Alves", phone: "(15) 99999-0003", email: "roberto@rotau.com", vanModel: "Fiat Ducato", plate: "ROT-3C03", capacity: 14, departureTime: "18:20", rating: 4.9, cities: "Jd. Europa, Sorocaba", colleges: "Uniso, UniFacens" });
      const passengers: [string, string, string, string, string, BookingStatus][] = [
        ["Mariana Costa", "mariana@email.com", "Jd. Europa", "UniFacens", "17:40", "Confirmado"],
        ["Lucas Ribeiro", "lucas@email.com", "Vila Hortência", "Fatec", "17:55", "Confirmado"],
        ["Ana Beatriz", "ana@email.com", "Centro", "Uniso", "18:10", "Aguardando"],
        ["Pedro Martins", "pedro@email.com", "Jd. Faculdade", "Unip", "18:20", "Confirmado"],
      ];
      for (const [name, email, address, college, pickupTime, status] of passengers) {
        const student = repo.createStudent({ name, email, address, college, phone: "(15) 98888-0000" });
        const booking = repo.createBooking({ studentId: student.id, driverId: carlos.id });
        repo.updateBooking(booking.id, { status, pickupTime });
      }
    },
  };

  return repo;
}
