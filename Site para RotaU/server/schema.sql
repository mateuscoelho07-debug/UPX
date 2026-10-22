-- Esquema do banco de dados do RotaU (SQLite)

PRAGMA foreign_keys = ON;

-- Faculdades atendidas pela plataforma
CREATE TABLE IF NOT EXISTS colleges (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE
);

-- Estudantes cadastrados
CREATE TABLE IF NOT EXISTS students (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  address    TEXT NOT NULL,
  college_id INTEGER NOT NULL REFERENCES colleges(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Motoristas e suas vans
CREATE TABLE IF NOT EXISTS drivers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  van_model      TEXT NOT NULL,
  plate          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  capacity       INTEGER NOT NULL DEFAULT 12 CHECK (capacity > 0),
  departure_time TEXT NOT NULL DEFAULT '17:30',
  rating         REAL NOT NULL DEFAULT 5.0 CHECK (rating BETWEEN 0 AND 5),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cidades por onde cada motorista passa (ordem = ordem da rota)
CREATE TABLE IF NOT EXISTS driver_cities (
  driver_id  INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  city       TEXT NOT NULL,
  PRIMARY KEY (driver_id, position)
);

-- Faculdades que cada motorista atende
CREATE TABLE IF NOT EXISTS driver_colleges (
  driver_id  INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  college_id INTEGER NOT NULL REFERENCES colleges(id),
  PRIMARY KEY (driver_id, college_id)
);

-- Reserva de vaga: liga um estudante à van de um motorista
CREATE TABLE IF NOT EXISTS bookings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  driver_id   INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  pickup      TEXT NOT NULL,
  pickup_time TEXT,
  status      TEXT NOT NULL DEFAULT 'Aguardando' CHECK (status IN ('Aguardando', 'Confirmado', 'Cancelado')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, driver_id)
);

-- Buscas feitas na página inicial (útil para saber onde há demanda)
CREATE TABLE IF NOT EXISTS searches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  address    TEXT NOT NULL,
  college_id INTEGER NOT NULL REFERENCES colleges(id),
  results    INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_driver_colleges_college ON driver_colleges(college_id);
CREATE INDEX IF NOT EXISTS idx_bookings_driver ON bookings(driver_id);
CREATE INDEX IF NOT EXISTS idx_students_college ON students(college_id);
