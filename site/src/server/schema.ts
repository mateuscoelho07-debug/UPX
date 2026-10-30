// Esquema do banco de dados do RotaU (SQLite / Turso).
// Fica num arquivo .ts (e não .sql) para ir junto no pacote do servidor do Angular.
export const schema = `
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
  password_hash TEXT,  -- scrypt (ver server/auth.ts); nulo = conta sem senha, não consegue entrar
  lat        REAL,     -- posição do endereço (só nos alunos de demonstração; nos outros é calculada pelo bairro/cidade)
  lng        REAL,
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
  departure_time TEXT NOT NULL DEFAULT '17:30',  -- saída da ida (busca os estudantes)
  return_time    TEXT,                           -- saída da volta (nulo = a combinar)
  subscription_until  TEXT,                      -- assinatura em dia até esta data (AAAA-MM-DD); nulo = nunca assinou
  subscription_notice TEXT,                      -- último aviso de vencimento enviado (evita repetir)
  terms_version  TEXT,                           -- versão dos termos que o motorista aceitou (nulo = não aceitou)
  terms_accepted_at TEXT,                        -- quando aceitou (UTC)
  rating         REAL NOT NULL DEFAULT 5.0 CHECK (rating BETWEEN 0 AND 5),
  password_hash  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Documentos do motorista (CNH e CRLV), um de cada tipo. Só o próprio motorista baixa o arquivo.
CREATE TABLE IF NOT EXISTS driver_documents (
  driver_id   INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('cnh', 'crlv')),
  filename    TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  content     BLOB NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (driver_id, kind)
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

-- Sessões de login: o cookie guarda o token, o banco guarda só o hash dele
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  profile    TEXT NOT NULL CHECK (profile IN ('student', 'driver', 'admin')),
  user_id    INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Presença do dia: o estudante avisa se vai ou não vai (data no horário de Brasília)
CREATE TABLE IF NOT EXISTS attendance (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  driver_id  INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,  -- AAAA-MM-DD
  going      INTEGER NOT NULL CHECK (going IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, day)
);

-- Quando o motorista iniciou a ida ou a volta de um dia
CREATE TABLE IF NOT EXISTS route_runs (
  driver_id  INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  day        TEXT NOT NULL,
  leg        TEXT NOT NULL CHECK (leg IN ('ida', 'volta')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (driver_id, day, leg)
);

-- Avisos mostrados no sino do painel (estudantes e motoristas)
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  profile    TEXT NOT NULL CHECK (profile IN ('student', 'driver')),
  user_id    INTEGER NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attendance_driver_day ON attendance(driver_id, day);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(profile, user_id, id);
CREATE INDEX IF NOT EXISTS idx_driver_colleges_college ON driver_colleges(college_id);
CREATE INDEX IF NOT EXISTS idx_bookings_driver ON bookings(driver_id);
CREATE INDEX IF NOT EXISTS idx_students_college ON students(college_id);
`;
