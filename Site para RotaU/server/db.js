// Camada de acesso ao banco de dados do RotaU.
// Usa o SQLite embutido no Node (node:sqlite, Node 22.13+), sem dependências nativas.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function openDatabase(file = process.env.DB_PATH ?? path.join(here, "data", "rotau.db")) {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(readFileSync(path.join(here, "schema.sql"), "utf8"));
  const repo = createRepository(db);
  if (process.env.SEED !== "false") repo.seedIfEmpty();
  return repo;
}

function createRepository(db) {
  function transaction(fn) {
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

  function splitList(value) {
    const items = Array.isArray(value) ? value : String(value ?? "").split(",");
    return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
  }

  function requireFields(data, fields) {
    for (const field of fields) {
      if (data[field] === undefined || String(data[field]).trim() === "") {
        throw new ApiError(400, `O campo "${field}" é obrigatório.`);
      }
    }
  }

  function findCollege(nameOrId) {
    const college = typeof nameOrId === "number"
      ? db.prepare("SELECT id, name FROM colleges WHERE id = ?").get(nameOrId)
      : db.prepare("SELECT id, name FROM colleges WHERE name = ?").get(String(nameOrId).trim());
    if (!college) throw new ApiError(400, `Faculdade "${nameOrId}" não encontrada.`);
    return college;
  }

  function findOrCreateCollege(name) {
    const existing = db.prepare("SELECT id, name FROM colleges WHERE name = ?").get(name);
    if (existing) return existing;
    const { lastInsertRowid } = db.prepare("INSERT INTO colleges (name) VALUES (?)").run(name);
    return { id: Number(lastInsertRowid), name };
  }

  function insertOrConflict(statement, params, conflictMessage) {
    try {
      return Number(statement.run(...params).lastInsertRowid);
    } catch (error) {
      if (String(error.message).includes("UNIQUE")) throw new ApiError(409, conflictMessage);
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

  function toDriver(row) {
    if (!row) return null;
    return {
      ...row,
      cities: row.cities ? row.cities.split(",") : [],
      colleges: row.colleges ? row.colleges.split(",") : [],
      freeSeats: Math.max(row.capacity - row.occupied, 0),
    };
  }

  function getDriver(id) {
    const driver = toDriver(db.prepare(`${driverSummarySql} WHERE d.id = ?`).get(id));
    if (!driver) throw new ApiError(404, "Motorista não encontrado.");
    return driver;
  }

  function getStudent(id) {
    const student = db.prepare(`
      SELECT s.id, s.name, s.phone, s.email, s.address, c.id AS collegeId, c.name AS college
      FROM students s JOIN colleges c ON c.id = s.college_id WHERE s.id = ?`).get(id);
    if (!student) throw new ApiError(404, "Estudante não encontrado.");
    return student;
  }

  function driversForCollege(collegeId) {
    return db.prepare(`${driverSummarySql}
      WHERE d.id IN (SELECT driver_id FROM driver_colleges WHERE college_id = ?)
      ORDER BY d.rating DESC, d.departure_time`).all(collegeId).map(toDriver);
  }

  const repo = {
    listColleges() {
      return db.prepare("SELECT id, name FROM colleges ORDER BY name").all();
    },

    createStudent(data) {
      requireFields(data, ["name", "phone", "email", "address", "college"]);
      const college = findCollege(data.college);
      const id = insertOrConflict(
        db.prepare("INSERT INTO students (name, phone, email, address, college_id) VALUES (?, ?, ?, ?, ?)"),
        [data.name.trim(), data.phone.trim(), data.email.trim(), data.address.trim(), college.id],
        "Já existe um estudante com este e-mail.",
      );
      return getStudent(id);
    },

    getStudent,

    createDriver(data) {
      requireFields(data, ["name", "phone", "email", "vanModel", "plate", "cities", "colleges"]);
      const cities = splitList(data.cities);
      const colleges = splitList(data.colleges);
      if (cities.length === 0) throw new ApiError(400, "Informe ao menos uma cidade.");
      if (colleges.length === 0) throw new ApiError(400, "Informe ao menos uma faculdade.");
      const capacity = Number(data.capacity ?? 12);
      if (!Number.isInteger(capacity) || capacity <= 0) throw new ApiError(400, "Número de lugares inválido.");
      const departureTime = String(data.departureTime ?? "17:30");
      if (!/^\d{2}:\d{2}$/.test(departureTime)) throw new ApiError(400, "Horário de saída inválido (use HH:MM).");

      const id = transaction(() => {
        const driverId = insertOrConflict(
          db.prepare(`INSERT INTO drivers (name, phone, email, van_model, plate, capacity, departure_time${data.rating !== undefined ? ", rating" : ""})
                      VALUES (?, ?, ?, ?, ?, ?, ?${data.rating !== undefined ? ", ?" : ""})`),
          [data.name.trim(), data.phone.trim(), data.email.trim(), data.vanModel.trim(), data.plate.trim().toUpperCase(), capacity, departureTime,
            ...(data.rating !== undefined ? [Number(data.rating)] : [])],
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
    searchRoutes({ address, college }) {
      requireFields({ address, college }, ["address", "college"]);
      const found = findCollege(college);
      const drivers = driversForCollege(found.id);
      db.prepare("INSERT INTO searches (address, college_id, results) VALUES (?, ?, ?)").run(address.trim(), found.id, drivers.length);
      return { college: found.name, count: drivers.length };
    },

    // Vans disponíveis para um estudante (ou para uma faculdade)
    listVans({ studentId, college }) {
      let target;
      let bookedDriverIds = new Set();
      if (studentId) {
        const student = getStudent(studentId);
        target = { id: student.collegeId, name: student.college };
        bookedDriverIds = new Set(
          db.prepare("SELECT driver_id FROM bookings WHERE student_id = ? AND status <> 'Cancelado'").all(studentId).map((row) => row.driver_id),
        );
      } else if (college) {
        target = findCollege(college);
      }
      const drivers = target
        ? driversForCollege(target.id)
        : db.prepare(`${driverSummarySql} ORDER BY d.rating DESC`).all().map(toDriver);
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
    driverDashboard(driverId) {
      const driver = getDriver(driverId);
      const passengers = db.prepare(`
        SELECT b.id AS bookingId, s.id AS studentId, s.name, b.pickup, b.pickup_time AS pickupTime, c.name AS college, b.status
        FROM bookings b
        JOIN students s ON s.id = b.student_id
        JOIN colleges c ON c.id = s.college_id
        WHERE b.driver_id = ? AND b.status <> 'Cancelado'
        ORDER BY coalesce(b.pickup_time, '99:99'), b.created_at`).all(driverId);
      const counts = new Map();
      for (const passenger of passengers) counts.set(passenger.college, (counts.get(passenger.college) ?? 0) + 1);
      const mainDestination = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? driver.colleges[0] ?? "—";
      return { driver, passengers, mainDestination };
    },

    createBooking({ studentId, driverId }) {
      requireFields({ studentId, driverId }, ["studentId", "driverId"]);
      return transaction(() => {
        const student = getStudent(Number(studentId));
        const driver = getDriver(Number(driverId));
        const existing = db.prepare("SELECT id, status FROM bookings WHERE student_id = ? AND driver_id = ?").get(student.id, driver.id);
        if (existing && existing.status !== "Cancelado") throw new ApiError(409, "Você já reservou uma vaga nesta van.");
        if (driver.freeSeats <= 0) throw new ApiError(409, "Esta van não tem vagas livres.");
        if (existing) {
          db.prepare("UPDATE bookings SET status = 'Aguardando', pickup = ? WHERE id = ?").run(student.address, existing.id);
          return { id: existing.id, status: "Aguardando" };
        }
        const { lastInsertRowid } = db.prepare("INSERT INTO bookings (student_id, driver_id, pickup) VALUES (?, ?, ?)").run(student.id, driver.id, student.address);
        return { id: Number(lastInsertRowid), status: "Aguardando" };
      });
    },

    updateBooking(id, { status, pickupTime }) {
      if (status !== undefined && !["Aguardando", "Confirmado", "Cancelado"].includes(status)) {
        throw new ApiError(400, "Status inválido.");
      }
      if (pickupTime !== undefined && pickupTime !== null && !/^\d{2}:\d{2}$/.test(pickupTime)) {
        throw new ApiError(400, "Horário de embarque inválido (use HH:MM).");
      }
      const booking = db.prepare("SELECT id FROM bookings WHERE id = ?").get(id);
      if (!booking) throw new ApiError(404, "Reserva não encontrada.");
      if (status !== undefined) db.prepare("UPDATE bookings SET status = ? WHERE id = ?").run(status, id);
      if (pickupTime !== undefined) db.prepare("UPDATE bookings SET pickup_time = ? WHERE id = ?").run(pickupTime, id);
      return db.prepare("SELECT id, status, pickup, pickup_time AS pickupTime FROM bookings WHERE id = ?").get(id);
    },

    seedIfEmpty() {
      if (db.prepare("SELECT COUNT(*) AS total FROM colleges").get().total > 0) return;
      transaction(() => {
        const addCollege = db.prepare("INSERT INTO colleges (name) VALUES (?)");
        for (const name of ["UniFacens", "Fatec", "Ufscar", "Uniso", "Unip"]) addCollege.run(name);
      });
      const carlos = repo.createDriver({ name: "Carlos Eduardo", phone: "(15) 99999-0001", email: "carlos@rotau.com", vanModel: "Renault Master", plate: "ROT-1A01", capacity: 12, departureTime: "17:30", rating: 4.9, cities: "Centro, Sorocaba", colleges: "UniFacens, Fatec, Uniso, Unip" });
      repo.createDriver({ name: "Fernanda Lima", phone: "(15) 99999-0002", email: "fernanda@rotau.com", vanModel: "Mercedes Sprinter", plate: "ROT-2B02", capacity: 15, departureTime: "18:00", rating: 4.8, cities: "Zona Norte, Sorocaba", colleges: "Fatec, Ufscar" });
      repo.createDriver({ name: "Roberto Alves", phone: "(15) 99999-0003", email: "roberto@rotau.com", vanModel: "Fiat Ducato", plate: "ROT-3C03", capacity: 14, departureTime: "18:20", rating: 4.9, cities: "Jd. Europa, Sorocaba", colleges: "Uniso, UniFacens" });
      const passengers = [
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
