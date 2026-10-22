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

export type Session = { profile: "student" | "driver" | "admin"; id: number; name: string };

export type AdminRow = Record<string, string | number | null>;

export type AdminOverview = {
  colleges: AdminRow[];
  students: AdminRow[];
  drivers: AdminRow[];
  bookings: AdminRow[];
  searches: AdminRow[];
};

// Erro da API com o status HTTP (401 = precisa fazer login)
export class ApiRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// A sessão fica num cookie httpOnly que o navegador envia sozinho (credentials)
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  const sendsBody = method !== "GET";
  try {
    res = await fetch(API_URL + path, {
      method,
      credentials: "include",
      headers: sendsBody ? { "Content-Type": "application/json" } : undefined,
      body: sendsBody ? JSON.stringify(body ?? {}) : undefined,
    });
  } catch {
    throw new Error("Não foi possível conectar ao servidor. Verifique se a API está rodando.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiRequestError(res.status, data.error ?? `Erro ${res.status}`);
  return data as T;
}

export const api = {
  colleges: () => request<College[]>("GET", "/colleges"),
  search: (address: string, college: string) =>
    request<{ college: string; count: number }>("POST", "/searches", { address, college }),
  me: () => request<Session>("GET", "/auth/me"),
  login: (profile: "student" | "driver", email: string, password: string) =>
    request<Session>("POST", "/auth/login", { profile, email, password }),
  logout: () => request("POST", "/auth/logout"),
  createStudent: (data: { name: string; phone: string; email: string; password: string; address: string; college: string }) =>
    request<Student>("POST", "/students", data),
  student: (id: number) => request<Student>("GET", `/students/${id}`),
  createDriver: (data: {
    name: string;
    phone: string;
    email: string;
    password: string;
    vanModel: string;
    plate: string;
    capacity: number;
    departureTime: string;
    cities: string;
    colleges: string;
  }) => request<Driver>("POST", "/drivers", data),
  driverDashboard: (id: number) => request<DriverDashboardData>("GET", `/drivers/${id}/dashboard`),
  vans: () => request<Van[]>("GET", "/vans"),
  book: (driverId: number) => request<{ id: number; status: BookingStatus }>("POST", "/bookings", { driverId }),
  updateBooking: (id: number, data: { status?: BookingStatus; pickupTime?: string | null }) =>
    request("PATCH", `/bookings/${id}`, data),
  adminLogin: (password: string) => request<Session>("POST", "/admin/login", { password }),
  adminOverview: () => request<AdminOverview>("GET", "/admin/overview"),
};
