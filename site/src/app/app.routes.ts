import { Routes } from "@angular/router";

export const routes: Routes = [
  { path: "", loadComponent: () => import("./home/home-page") },
  { path: "painel", loadComponent: () => import("./dashboard/dashboard-page") },
  { path: "admin", loadComponent: () => import("./admin/admin-page") },
  { path: "**", redirectTo: "" },
];
