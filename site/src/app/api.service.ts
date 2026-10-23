// Cliente da API do RotaU (rotas em src/server/api.ts). Em desenvolvimento e na Vercel
// a API responde no mesmo endereço do site, em /api.
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { firstValueFrom, type Observable } from "rxjs";

const API_URL = "/api";

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
  going: boolean | null;
};

export type Leg = "ida" | "volta";
export type TodayLeg = { leg: Leg; scheduled: string | null; startedAt: string | null; eta: string | null };

export type DriverToday = { day: string; weekday: string; going: number; notGoing: number; pending: number; legs: TodayLeg[] };

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

export type DriverDashboardData = { driver: Driver; passengers: Passenger[]; mainDestination: string; today: DriverToday };

export type Session = { profile: "student" | "driver" | "admin"; id: number; name: string };

export type Notification = { id: number; title: string; body: string; createdAt: string; read: boolean };
export type NotificationList = { unread: number; items: Notification[] };

export type AdminRow = Record<string, string | number | null>;

export type AdminOverview = {
  colleges: AdminRow[];
  students: AdminRow[];
  drivers: AdminRow[];
  bookings: AdminRow[];
  attendance: AdminRow[];
  searches: AdminRow[];
};

export type StudentSignup = { name: string; phone: string; email: string; password: string; address: string; college: string };
export type DriverSignup = {
  name: string;
  phone: string;
  email: string;
  password: string;
  vanModel: string;
  plate: string;
  capacity: number;
  departureTime: string;
  returnTime: string;
  cities: string;
  colleges: string;
};

// Erro da API com o status HTTP (401 = precisa fazer login)
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// A sessão fica num cookie httpOnly que o navegador envia sozinho (withCredentials)
@Injectable({ providedIn: "root" })
export class ApiService {
  private readonly http = inject(HttpClient);

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const sendsBody = method !== "GET";
    const call: Observable<T> = this.http.request<T>(method, API_URL + path, {
      body: sendsBody ? (body ?? {}) : undefined,
      withCredentials: true,
    });
    try {
      return await firstValueFrom(call);
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 0) throw new ApiRequestError(0, "Não foi possível conectar ao servidor. Verifique se a API está rodando.");
        const message = typeof err.error?.error === "string" ? err.error.error : `Erro ${err.status}`;
        throw new ApiRequestError(err.status, message);
      }
      throw err;
    }
  }

  colleges = () => this.request<College[]>("GET", "/colleges");
  search = (address: string, college: string) => this.request<{ college: string; count: number }>("POST", "/searches", { address, college });
  me = () => this.request<Session>("GET", "/auth/me");
  login = (profile: "student" | "driver", email: string, password: string) =>
    this.request<Session>("POST", "/auth/login", { profile, email, password });
  logout = () => this.request<{ ok: true }>("POST", "/auth/logout");
  createStudent = (data: StudentSignup) => this.request<Student>("POST", "/students", data);
  student = (id: number) => this.request<Student>("GET", `/students/${id}`);
  createDriver = (data: DriverSignup) => this.request<Driver>("POST", "/drivers", data);
  driverDashboard = (id: number) => this.request<DriverDashboardData>("GET", `/drivers/${id}/dashboard`);
  startRoute = (id: number, leg: Leg) => this.request<DriverToday>("POST", `/drivers/${id}/route-runs`, { leg });
  vans = () => this.request<Van[]>("GET", "/vans");
  book = (driverId: number) => this.request<{ id: number; status: BookingStatus }>("POST", "/bookings", { driverId });
  updateBooking = (id: number, data: { status?: BookingStatus; pickupTime?: string | null }) =>
    this.request<unknown>("PATCH", `/bookings/${id}`, data);
  today = () => this.request<StudentToday>("GET", "/attendance/today");
  setGoing = (going: boolean) => this.request<StudentToday>("PUT", "/attendance/today", { going });
  notifications = () => this.request<NotificationList>("GET", "/notifications");
  markNotificationsRead = () => this.request<{ ok: true }>("POST", "/notifications/read");
  adminLogin = (password: string) => this.request<Session>("POST", "/admin/login", { password });
  adminOverview = () => this.request<AdminOverview>("GET", "/admin/overview");
}
