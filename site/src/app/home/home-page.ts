import { ChangeDetectionStrategy, Component, afterNextRender, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { ApiService, type Session } from "../api.service";
import { Field } from "../shared/field";
import { Icon, type IconName } from "../shared/icon";
import { Logo } from "../shared/logo";

const defaultColleges = ["UniFacens", "Fatec", "Ufscar", "Uniso", "Unip", "Unesp", "IFSP", "PUC-SP", "Anhanguera", "ESAMC", "Fadi", "Ceunsp"];

type Profile = "student" | "driver";

// Página inicial: busca de vans, cadastro e login (estudante ou motorista)
@Component({
  selector: "app-home-page",
  imports: [Field, Icon, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./home-page.html",
})
export default class HomePage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly steps: { number: string; icon: IconName; title: string; text: string }[] = [
    { number: "01", icon: "location", title: "Informe seu endereço", text: "Conte onde você mora e qual faculdade frequenta." },
    { number: "02", icon: "route", title: "Compare as rotas", text: "Veja vans que passam perto, horários e instituições atendidas." },
    { number: "03", icon: "bus", title: "Escolha e vá tranquilo", text: "Confirme todo dia se você vai e receba o aviso quando a van sair." },
  ];

  readonly modalOpen = signal(false);
  readonly mode = signal<"signup" | "login">("signup");
  readonly profile = signal<Profile>("student");
  readonly colleges = signal<string[]>(defaultColleges);
  readonly search = signal({ address: "", college: "" });
  readonly searchResult = signal<{ college: string; count: number } | null>(null);
  readonly searchError = signal<string | null>(null);
  readonly session = signal<Session | null>(null);
  readonly registered = signal(false);
  readonly submitting = signal(false);
  readonly signupError = signal<string | null>(null);
  readonly apiOffline = signal(false);

  constructor() {
    // Só no navegador: a página é gerada no build sem falar com a API
    afterNextRender(() => {
      // Recupera a sessão do cookie (o painel de admin tem login próprio)
      this.api.me().then(
        (me) => this.session.set(me.profile === "admin" ? null : me),
        () => this.session.set(null),
      );
      this.api.colleges().then(
        (list) => {
          this.colleges.set(list.map((college) => college.name));
          this.apiOffline.set(false);
        },
        () => {
          this.colleges.set(defaultColleges);
          this.apiOffline.set(true);
        },
      );
    });
  }

  firstName(name: string) {
    return name.split(" ")[0];
  }

  openSignup(type: Profile, modalMode: "signup" | "login" = "signup") {
    this.profile.set(type);
    this.mode.set(modalMode);
    this.registered.set(false);
    this.signupError.set(null);
    this.modalOpen.set(true);
  }

  switchMode(modalMode: "signup" | "login") {
    this.mode.set(modalMode);
    this.signupError.set(null);
  }

  scrollToSearch() {
    document.querySelector("#buscar")?.scrollIntoView({ behavior: "smooth" });
  }

  setSearch(field: "address" | "college", event: Event) {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.search.update((current) => ({ ...current, [field]: value }));
  }

  async handleSearch(event: Event) {
    event.preventDefault();
    this.searchError.set(null);
    try {
      this.searchResult.set(await this.api.search(this.search().address, this.search().college));
    } catch (err) {
      this.searchResult.set(null);
      this.searchError.set((err as Error).message);
    }
  }

  async handleSignup(event: Event) {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    const field = (name: string) => String(form.get(name) ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("passwordConfirm") ?? "")) {
      this.signupError.set("As senhas não conferem.");
      return;
    }
    const profile = this.profile();
    this.submitting.set(true);
    this.signupError.set(null);
    try {
      const created = profile === "student"
        ? await this.api.createStudent({ name: field("name"), phone: field("phone"), email: field("email"), password, address: field("address"), college: field("college") })
        : await this.api.createDriver({
            name: field("name"),
            phone: field("phone"),
            email: field("email"),
            password,
            vanModel: field("vanModel"),
            plate: field("plate"),
            capacity: Number(field("capacity")),
            departureTime: field("departureTime"),
            returnTime: field("returnTime"),
            cities: field("cities"),
            colleges: field("colleges"),
          });
      this.session.set({ profile, id: created.id, name: created.name });
      this.registered.set(true);
    } catch (err) {
      this.signupError.set((err as Error).message);
    } finally {
      this.submitting.set(false);
    }
  }

  async handleLogin(event: Event) {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    this.submitting.set(true);
    this.signupError.set(null);
    try {
      const me = await this.api.login(this.profile(), String(form.get("email") ?? "").trim(), String(form.get("password") ?? ""));
      this.session.set(me);
      this.openDashboard();
    } catch (err) {
      this.signupError.set((err as Error).message);
    } finally {
      this.submitting.set(false);
    }
  }

  openDashboard() {
    this.modalOpen.set(false);
    this.router.navigate(["/painel"]);
  }

  logout() {
    this.api.logout().catch(() => {});
    this.session.set(null);
  }
}
