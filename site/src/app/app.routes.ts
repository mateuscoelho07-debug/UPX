import { Routes } from "@angular/router";

export const routes: Routes = [
  { path: "", loadComponent: () => import("./home/home-page") },
  { path: "painel/van/:id", loadComponent: () => import("./dashboard/van-detail-page") },
  { path: "painel", loadComponent: () => import("./dashboard/dashboard-page") },
  { path: "admin", loadComponent: () => import("./admin/admin-page") },
  { path: "**", redirectTo: "" },
];
