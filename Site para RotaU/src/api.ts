// Cliente da API do RotaU (ver server/index.ts).
// Em desenvolvimento o Vite encaminha /api para o servidor na porta 3001.
const API_URL = import.meta.env.VITE_API_URL ?? "/api";

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

export type BookingStatus = "Aguardando" | "Confirmado" | "Cancelado";

export type Passenger = {
  bookingId: number;
  studentId: number;
  name: string;
  pickup: string;
  pickupTime: string | null;
  college: string;
  status: BookingStatus;
};

export type DriverDashboardData = { driver: Driver; passengers: Passenger[]; mainDestination: string };

export type Session = { profile: "student" | "driver"; id: number };

export type AdminRow = Record<string, string | number | null>;

export type AdminOverview = {
  colleges: AdminRow[];
  students: AdminRow[];
  drivers: AdminRow[];
  bookings: AdminRow[];
  searches: AdminRow[];
  protected: boolean;
};

async function request<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...extraHeaders },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Não foi possível conectar ao servidor. Verifique se a API está rodando.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
  return data as T;
}

export const api = {
  colleges: () => request<College[]>("GET", "/colleges"),
  search: (address: string, college: string) =>
    request<{ college: string; count: number }>("POST", "/searches", { address, college }),
  createStudent: (data: { name: string; phone: string; email: string; address: string; college: string }) =>
    request<Student>("POST", "/students", data),
  student: (id: number) => request<Student>("GET", `/students/${id}`),
  createDriver: (data: {
    name: string;
    phone: string;
    email: string;
    vanModel: string;
    plate: string;
    capacity: number;
    departureTime: string;
    cities: string;
    colleges: string;
  }) => request<Driver>("POST", "/drivers", data),
  driverDashboard: (id: number) => request<DriverDashboardData>("GET", `/drivers/${id}/dashboard`),
  vans: (studentId: number) => request<Van[]>("GET", `/vans?studentId=${studentId}`),
  book: (studentId: number, driverId: number) =>
    request<{ id: number; status: BookingStatus }>("POST", "/bookings", { studentId, driverId }),
  updateBooking: (id: number, data: { status?: BookingStatus; pickupTime?: string | null }) =>
    request("PATCH", `/bookings/${id}`, data),
  adminOverview: (token?: string) =>
    request<AdminOverview>("GET", "/admin/overview", undefined, token ? { "x-admin-token": token } : undefined),
};

const SESSION_KEY = "rotau.session";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // armazenamento indisponível: a sessão dura só até recarregar a página
  }
}
