import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, loadSession, saveSession, type BookingStatus, type DriverDashboardData, type Passenger, type Session, type Student, type Van } from "./api";

type IconName =
  | "arrow"
  | "bus"
  | "check"
  | "clock"
  | "close"
  | "location"
  | "route"
  | "search"
  | "shield"
  | "sparkle"
  | "student"
  | "user"
  | "van";

function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    bus: <><rect x="5" y="3" width="14" height="16" rx="3" /><path d="M5 10h14M8 19v2M16 19v2M8.5 15h.01M15.5 15h.01M8 7h8" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h3a3 3 0 0 0 0-6h2a3 3 0 0 0 3-3V8" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    sparkle: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" /><path d="m18 14 .7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7L18 14Z" /></>,
    student: <><path d="m3 10 9-5 9 5-9 5-9-5Z" /><path d="M7 12.5V17c3 2.4 7 2.4 10 0v-4.5M21 10v6" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    van: <><path d="M3 16V7a2 2 0 0 1 2-2h10l5 5v6" /><path d="M3 13h17M15 5v5h5" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></>,
  };

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img className="h-11 w-16 rounded-xl object-cover shadow-lg shadow-blue-200" src="/rotau-logo.png" alt="" />
      <span className="text-xl font-extrabold tracking-tight text-slate-950">
        Rota<span className="text-blue-600">U</span>
      </span>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <span className="relative block">
        <Icon name={icon} className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
        {children}
      </span>
    </label>
  );
}

const defaultColleges = ["UniFacens", "Fatec", "Ufscar", "Uniso", "Unip"];

function DashboardHeader({
  profile,
  onBack,
}: {
  profile: "student" | "driver";
  onBack: () => void;
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 sm:inline">
            {profile === "driver" ? "Perfil motorista" : "Perfil estudante"}
          </span>
          <button className="btn-secondary !px-4 !py-2.5 text-sm" onClick={onBack}>
            Voltar ao início
          </button>
        </div>
      </div>
    </header>
  );
}

const weekdays = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");
}

function StatusMessage({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading) return <p className="mt-8 text-slate-500">Carregando...</p>;
  if (!error) return null;
  return (
    <div className="mt-8 rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-800">
      <strong className="block">Não foi possível carregar os dados.</strong>
      <span>{error}</span>
      <button className="ml-3 font-bold underline" onClick={onRetry}>Tentar de novo</button>
    </div>
  );
}

function DriverDashboard({ driverId, onBack }: { driverId: number; onBack: () => void }) {
  const [data, setData] = useState<DriverDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.driverDashboard(driverId)
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [driverId]);

  useEffect(load, [load]);

  async function setStatus(passenger: Passenger, status: BookingStatus) {
    try {
      await api.updateBooking(passenger.bookingId, { status });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const driver = data?.driver;
  const passengers = data?.passengers ?? [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <DashboardHeader profile="driver" onBack={onBack} />
      <main className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <span className="section-tag">Rota de hoje</span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Seus passageiros</h1>
            <p className="mt-2 text-slate-600">{driver ? `Olá, ${driver.name.split(" ")[0]}! ` : ""}Acompanhe os embarques e mantenha sua rota organizada.</p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-blue-950">
            <span className="grid size-10 place-items-center rounded-xl bg-blue-600 text-white"><Icon name="clock" /></span>
            <div><span className="block text-xs font-bold uppercase tracking-wider text-blue-600">Próxima saída</span><strong className="text-lg">{driver?.departureTime ?? "--:--"}</strong></div>
          </div>
        </div>

        <StatusMessage loading={loading && !data} error={error} onRetry={load} />

        {driver && (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-5"><span className="text-sm font-semibold text-slate-500">Passageiros</span><strong className="mt-2 block text-3xl font-extrabold text-slate-950">{passengers.length}</strong></article>
              <article className="rounded-2xl border border-slate-200 bg-white p-5"><span className="text-sm font-semibold text-slate-500">Vagas livres</span><strong className="mt-2 block text-3xl font-extrabold text-blue-600">{driver.freeSeats}</strong></article>
              <article className="rounded-2xl border border-slate-200 bg-white p-5"><span className="text-sm font-semibold text-slate-500">Destino principal</span><strong className="mt-2 block text-lg font-extrabold text-slate-950">{data?.mainDestination}</strong></article>
            </div>

            <section className="mt-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-blue-900/5">
              <div className="flex flex-col gap-2 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-lg font-extrabold text-slate-950">Lista de embarque</h2><p className="mt-1 text-sm text-slate-500">{weekdays[new Date().getDay()]}, rota {driver.cities[driver.cities.length - 1] ?? ""}</p></div>
                <span className="text-sm font-semibold text-slate-500">{driver.occupied} de {driver.capacity} lugares ocupados</span>
              </div>
              {passengers.length === 0 && (
                <p className="px-6 py-10 text-center text-sm text-slate-500">Nenhum passageiro ainda. Assim que um estudante reservar uma vaga, ele aparece aqui.</p>
              )}
              <div className="divide-y divide-slate-100">
                {passengers.map((passenger) => (
                  <article className="grid gap-4 px-6 py-5 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-center" key={passenger.bookingId}>
                    <div className="flex items-center gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-extrabold text-blue-700">{initials(passenger.name)}</span>
                      <div><strong className="block text-sm text-slate-950">{passenger.name}</strong><span className="text-xs text-slate-500">Passageiro</span></div>
                    </div>
                    <span className="flex items-center gap-2 text-sm text-slate-600"><Icon name="location" className="size-4 text-slate-400" />{passenger.pickup}{passenger.pickupTime ? `, ${passenger.pickupTime}` : ""}</span>
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Icon name="student" className="size-4 text-slate-400" />{passenger.college}</span>
                    {passenger.status === "Aguardando" ? (
                      <span className="flex items-center gap-2">
                        <span className="w-fit rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">Aguardando</span>
                        <button className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700" onClick={() => setStatus(passenger, "Confirmado")}>Confirmar</button>
                        <button className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200" onClick={() => setStatus(passenger, "Cancelado")}>Recusar</button>
                      </span>
                    ) : (
                      <span className="w-fit rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">{passenger.status}</span>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StudentDashboard({ studentId, onBack }: { studentId: number; onBack: () => void }) {
  const [student, setStudent] = useState<Student | null>(null);
  const [vans, setVans] = useState<Van[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api.student(studentId), api.vans(studentId)])
      .then(([studentData, vansData]) => {
        setStudent(studentData);
        setVans(vansData);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [studentId]);

  useEffect(load, [load]);

  async function book(van: Van) {
    try {
      await api.book(studentId, van.id);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <DashboardHeader profile="student" onBack={onBack} />
      <main className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
        <div className="max-w-2xl">
          <span className="section-tag">Rotas para você</span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Vans disponíveis</h1>
          <p className="mt-2 text-slate-600">Encontramos motoristas com rotas próximas ao seu endereço e à sua faculdade.</p>
        </div>

        {student && (
          <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white"><Icon name="location" /></span>
              <div><strong className="block text-sm text-blue-950">Saindo de {student.address}</strong><span className="text-sm text-blue-700">Rotas para {student.college}</span></div>
            </div>
            <button className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-100" onClick={onBack}>Alterar busca</button>
          </div>
        )}

        <StatusMessage loading={loading && !student} error={error} onRetry={load} />

        {student && vans.length === 0 && (
          <p className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-600">Ainda não há vans atendendo a {student.college}. Volte em breve!</p>
        )}

        <section className="mt-6 grid gap-5 lg:grid-cols-3">
          {vans.map((van, index) => (
            <article className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-blue-900/5 transition hover:-translate-y-1 hover:border-blue-200" key={van.id}>
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-12 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon name="van" /></span>
                {van.booked ? (
                  <span className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">Sua van</span>
                ) : index === 0 && <span className="rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">Melhor opção</span>}
              </div>
              <h2 className="mt-5 text-lg font-extrabold text-slate-950">{van.driver}</h2>
              <p className="mt-1 text-sm text-slate-500">{van.vehicle}</p>
              <div className="my-5 space-y-3 border-y border-slate-100 py-5">
                <p className="flex items-center gap-3 text-sm font-semibold text-slate-700"><Icon name="route" className="size-5 text-blue-600" />{van.route}</p>
                <p className="flex items-center gap-3 text-sm text-slate-600"><Icon name="clock" className="size-5 text-blue-600" />Saída às {van.time}</p>
              </div>
              <div className="mb-5 flex items-center justify-between text-sm">
                <span className={`font-bold ${van.freeSeats > 0 ? "text-emerald-700" : "text-red-600"}`}>{van.freeSeats === 0 ? "Lotada" : `${van.freeSeats} ${van.freeSeats === 1 ? "vaga" : "vagas"}`}</span>
                <span className="font-semibold text-slate-600">★ {van.rating.toFixed(1).replace(".", ",")}</span>
              </div>
              {van.booked ? (
                <p className="mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 px-6 py-3.5 font-bold text-emerald-700"><Icon name="check" /> Vaga reservada</p>
              ) : (
                <button className="btn-primary mt-auto w-full justify-center disabled:opacity-50" disabled={van.freeSeats === 0} onClick={() => book(van)}>Reservar vaga <Icon name="arrow" /></button>
              )}
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const [profile, setProfile] = useState<"student" | "driver">("student");
  const [colleges, setColleges] = useState<string[]>(defaultColleges);
  const [search, setSearch] = useState({ address: "", college: "" });
  const [searchResult, setSearchResult] = useState<{ college: string; count: number } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(loadSession);
  const [registered, setRegistered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<Session | null>(null);

  useEffect(() => {
    api.colleges()
      .then((list) => setColleges(list.map((college) => college.name)))
      .catch(() => setColleges(defaultColleges));
  }, []);

  function openSignup(type: "student" | "driver") {
    setProfile(type);
    setRegistered(false);
    setSignupError(null);
    setModalOpen(true);
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    setSearchError(null);
    try {
      setSearchResult(await api.search(search.address, search.college));
    } catch (err) {
      setSearchResult(null);
      setSearchError((err as Error).message);
    }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "").trim();
    setSubmitting(true);
    setSignupError(null);
    try {
      const created = profile === "student"
        ? await api.createStudent({ name: field("name"), phone: field("phone"), email: field("email"), address: field("address"), college: field("college") })
        : await api.createDriver({
            name: field("name"),
            phone: field("phone"),
            email: field("email"),
            vanModel: field("vanModel"),
            plate: field("plate"),
            capacity: Number(field("capacity")),
            departureTime: field("departureTime"),
            cities: field("cities"),
            colleges: field("colleges"),
          });
      const newSession: Session = { profile, id: created.id };
      saveSession(newSession);
      setSession(newSession);
      setRegistered(true);
    } catch (err) {
      setSignupError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function openDashboard() {
    if (!session) return;
    setModalOpen(false);
    setDashboard(session);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function logout() {
    saveSession(null);
    setSession(null);
  }

  if (dashboard?.profile === "driver") {
    return <DriverDashboard driverId={dashboard.id} onBack={() => setDashboard(null)} />;
  }

  if (dashboard?.profile === "student") {
    return <StudentDashboard studentId={dashboard.id} onBack={() => setDashboard(null)} />;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-slate-900">
      <header className="relative z-20 border-b border-slate-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <Logo />
          <nav className="hidden items-center gap-8 md:flex" aria-label="Navegação principal">
            <a className="nav-link" href="#como-funciona">Como funciona</a>
            <a className="nav-link" href="#para-quem">Para quem é</a>
            <a className="nav-link" href="#sobre">Sobre nós</a>
          </nav>
          {session ? (
            <div className="flex items-center gap-2">
              <button className="btn-secondary !mb-[10px] !ml-0 !mr-0 !mt-[10px] flex-row items-center justify-center !pb-2.5 !pl-5 !pr-5 !pt-2.5" onClick={openDashboard}>
                Meu painel
              </button>
              <button className="text-sm font-semibold text-slate-500 hover:text-slate-800" onClick={logout}>Sair</button>
            </div>
          ) : (
            <button className="btn-secondary !mb-[10px] !ml-0 !mr-0 !mt-[10px] flex-row items-center justify-center !pb-2.5 !pl-5 !pr-5 !pt-2.5" onClick={() => openSignup("student")}>
              Criar conta
            </button>
          )}
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden bg-blue-50/60">
          <div className="hero-grid absolute inset-0 -z-10 opacity-60" />
          <div className="absolute -right-40 -top-40 -z-10 size-[34rem] rounded-full bg-blue-200/40 blur-3xl" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-24">
            <div>
              <div className="eyebrow">
                Seu caminho até a faculdade começa aqui
              </div>
              <h1 className="mt-6 max-w-2xl text-4xl font-extrabold leading-[1.08] tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
                A rota certa para o seu <span className="text-blue-600">futuro.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
                O RotaU conecta estudantes a motoristas de vans universitárias. Encontre uma rota segura, prática e que passa perto de você.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button className="btn-primary justify-center" onClick={() => document.querySelector("#buscar")?.scrollIntoView({ behavior: "smooth" })}>
                  Encontrar minha rota <Icon name="arrow" />
                </button>
                <button className="btn-secondary" onClick={() => openSignup("driver")}>
                  <Icon name="van" /> Sou motorista
                </button>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-slate-600">
                <span className="flex items-center gap-2"><Icon name="check" className="size-4 text-blue-600" /> Cadastro gratuito</span>
                <span className="flex items-center gap-2"><Icon name="shield" className="size-4 text-blue-600" /> Perfis verificados</span>
              </div>
            </div>

            <div id="buscar" className="relative scroll-mt-24">
              <div className="route-orbit" aria-hidden="true">
                <span className="absolute left-9 top-10 grid size-12 place-items-center rounded-2xl bg-white text-blue-600 shadow-xl"><Icon name="student" /></span>
                <span className="absolute bottom-8 right-8 grid size-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-xl"><Icon name="van" /></span>
                <span className="absolute left-24 top-20 h-28 w-48 rounded-[50%] border-2 border-dashed border-blue-300" />
              </div>
              <form onSubmit={handleSearch} className="relative mx-auto max-w-lg rounded-3xl border border-white bg-white p-6 shadow-2xl shadow-blue-900/10 sm:p-8">
                <div className="mb-7 flex items-start justify-between">
                  <div>
                    <p className="text-xl font-bold text-slate-950">Encontre sua van</p>
                    <p className="mt-1 text-sm text-slate-500">Informe seu ponto de partida e destino.</p>
                  </div>
                  <span className="grid size-11 place-items-center rounded-xl bg-blue-50 text-blue-600"><Icon name="search" /></span>
                </div>
                <div className="space-y-5">
                  <Field label="Onde você mora?" icon="location">
                    <input className="form-control" required placeholder="Rua, bairro ou cidade" value={search.address} onChange={(e) => setSearch({ ...search, address: e.target.value })} />
                  </Field>
                  <Field label="Qual é a sua faculdade?" icon="student">
                    <select className="form-control appearance-none" required value={search.college} onChange={(e) => setSearch({ ...search, college: e.target.value })}>
                      <option value="" disabled>Selecione sua faculdade</option>
                      {colleges.map((college) => <option key={college}>{college}</option>)}
                    </select>
                  </Field>
                  <button className="btn-primary w-full justify-center" type="submit">
                    <Icon name="search" /> Buscar rotas disponíveis
                  </button>
                </div>
                {searchResult && (
                  <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
                    <div className="flex gap-3">
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-blue-600 text-white"><Icon name={searchResult.count > 0 ? "check" : "search"} className="size-4" /></span>
                      {searchResult.count > 0 ? (
                        <div><strong className="block">Encontramos {searchResult.count} {searchResult.count === 1 ? "rota" : "rotas"} para a {searchResult.college}!</strong><span className="text-blue-700">Crie sua conta para ver motoristas e horários.</span></div>
                      ) : (
                        <div><strong className="block">Ainda não há vans para a {searchResult.college}.</strong><span className="text-blue-700">Crie sua conta e avisamos quando surgir uma rota.</span></div>
                      )}
                    </div>
                  </div>
                )}
                {searchError && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{searchError}</p>}
              </form>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="scroll-mt-20 px-5 py-20 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <span className="section-tag">Simples e rápido</span>
              <h2 className="section-title">Da sua casa à faculdade, sem complicação</h2>
              <p className="section-copy">Em poucos passos, encontre a melhor opção para a sua rotina universitária.</p>
            </div>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {[
                ["01", "location", "Informe seu endereço", "Conte onde você mora e qual faculdade frequenta."],
                ["02", "route", "Compare as rotas", "Veja vans que passam perto, horários e instituições atendidas."],
                ["03", "bus", "Escolha e vá tranquilo", "Converse com o motorista e combine sua próxima viagem."],
              ].map(([number, icon, title, text]) => (
                <article className="step-card" key={number}>
                  <span className="absolute right-6 top-5 text-5xl font-black text-slate-100">{number}</span>
                  <span className="icon-box"><Icon name={icon as IconName} /></span>
                  <h3 className="mt-6 text-lg font-bold text-slate-950">{title}</h3>
                  <p className="mt-2 leading-7 text-slate-600">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="sobre" className="bg-slate-950 px-5 py-20 text-white lg:px-8 lg:py-24">
          <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="section-tag !border-blue-800 !bg-blue-950 !text-blue-300">Quem somos</span>
              <h2 className="mt-5 max-w-xl text-3xl font-extrabold tracking-tight sm:text-4xl">Conectamos caminhos. Aproximamos oportunidades.</h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
                Somos uma plataforma criada para facilitar a mobilidade universitária. Aproximamos quem precisa chegar à faculdade de quem já faz esse caminho todos os dias.
              </p>
              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="dark-stat"><strong>Mais acesso</strong><span>à educação</span></div>
                <div className="dark-stat"><strong>Mais segurança</strong><span>no trajeto</span></div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <article className="value-card sm:mt-8"><Icon name="shield" className="size-7 text-blue-400" /><h3>Confiança</h3><p>Perfis completos para você escolher com tranquilidade.</p></article>
              <article className="value-card"><Icon name="route" className="size-7 text-blue-400" /><h3>Praticidade</h3><p>Todas as informações da rota reunidas em um só lugar.</p></article>
              <article className="value-card sm:mt-8"><Icon name="clock" className="size-7 text-blue-400" /><h3>Tempo</h3><p>Menos tempo procurando, mais tempo para seus planos.</p></article>
              <article className="value-card"><Icon name="student" className="size-7 text-blue-400" /><h3>Comunidade</h3><p>Uma rede feita para universitários e motoristas locais.</p></article>
            </div>
          </div>
        </section>

        <section id="para-quem" className="bg-blue-50 px-5 py-20 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="text-center">
              <span className="section-tag">Faça parte</span>
              <h2 className="section-title">Escolha como você quer usar o RotaU</h2>
            </div>
            <div className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-2">
              <article className="profile-card">
                <span className="icon-box"><Icon name="student" /></span>
                <p className="mt-6 text-sm font-bold uppercase tracking-widest text-blue-600">Para estudantes</p>
                <h3 className="mt-2 text-2xl font-extrabold">Encontre seu transporte</h3>
                <p className="mt-3 leading-7 text-slate-600">Cadastre seu endereço e faculdade para descobrir as vans que combinam com a sua rotina.</p>
                <button className="btn-primary mt-7 w-full justify-center" onClick={() => openSignup("student")}>Quero encontrar uma van <Icon name="arrow" /></button>
              </article>
              <article className="profile-card border-blue-200 bg-blue-600 text-white">
                <span className="grid size-12 place-items-center rounded-xl bg-[rgba(150,157,173,0.15)] text-white"><Icon name="van" className="size-5 [&>*]:stroke-blue-500" /></span>
                <p className="mt-6 text-sm font-bold uppercase tracking-widest text-blue-600">Para motoristas</p>
                <h3 className="mt-2 text-2xl font-extrabold text-black">Divulgue suas rotas</h3>
                <p className="mt-3 leading-7 text-slate-600">Cadastre sua van, cidades e faculdades atendidas para preencher suas vagas com facilidade.</p>
                <button className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 font-bold text-white transition hover:bg-blue-700" onClick={() => openSignup("driver")}>Quero cadastrar minha van <Icon name="arrow" /></button>
              </article>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-5 py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 sm:flex-row">
          <Logo />
          <p className="text-sm text-slate-500">© 2026 RotaU. Seu caminho para a universidade.</p>
        </div>
      </footer>

      {modalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Criar conta">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between">
              <div><p className="text-2xl font-extrabold text-slate-950">Crie sua conta</p><p className="mt-1 text-sm text-slate-500">Comece agora, é rápido e gratuito.</p></div>
              <button className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200" onClick={() => setModalOpen(false)} aria-label="Fechar"><Icon name="close" /></button>
            </div>
            {registered ? (
              <div className="py-12 text-center">
                <span className="mx-auto grid size-16 place-items-center rounded-full bg-blue-100 text-blue-600"><Icon name="check" className="size-8" /></span>
                <h3 className="mt-5 text-2xl font-extrabold">Cadastro enviado!</h3>
                <p className="mx-auto mt-2 max-w-sm text-slate-600">
                  {profile === "driver" ? "Seu perfil foi criado. Veja agora os passageiros da sua rota de hoje." : "Seu perfil foi criado. Veja agora as vans disponíveis para a sua rota."}
                </p>
                <button className="btn-primary mx-auto mt-7" onClick={openDashboard}>
                  {profile === "driver" ? "Ver passageiros" : "Ver vans disponíveis"} <Icon name="arrow" />
                </button>
              </div>
            ) : (
              <>
                <div className="mt-7 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                  <button className={`profile-tab ${profile === "student" ? "active" : ""}`} onClick={() => setProfile("student")}><Icon name="student" /> Estudante</button>
                  <button className={`profile-tab ${profile === "driver" ? "active" : ""}`} onClick={() => setProfile("driver")}><Icon name="van" /> Motorista</button>
                </div>
                <form className="mt-6 space-y-4" onSubmit={handleSignup}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nome completo" icon="user"><input className="form-control" name="name" required placeholder="Seu nome" /></Field>
                    <Field label="Celular" icon="user"><input className="form-control" name="phone" required type="tel" placeholder="(00) 00000-0000" /></Field>
                  </div>
                  <Field label="E-mail" icon="user"><input className="form-control" name="email" required type="email" placeholder="voce@email.com" /></Field>
                  {profile === "student" ? (
                    <>
                      <Field label="Seu endereço" icon="location"><input className="form-control" name="address" required placeholder="Rua, número, bairro e cidade" defaultValue={search.address} /></Field>
                      <Field label="Faculdade onde estuda" icon="student">
                        <select className="form-control appearance-none" name="college" required defaultValue={search.college}>
                          <option value="" disabled>Selecione sua faculdade</option>
                          {colleges.map((college) => <option key={college}>{college}</option>)}
                        </select>
                      </Field>
                    </>
                  ) : (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Modelo da van" icon="van"><input className="form-control" name="vanModel" required placeholder="Ex.: Renault Master" /></Field>
                        <Field label="Placa" icon="van"><input className="form-control" name="plate" required placeholder="ABC-1D23" /></Field>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Lugares na van" icon="user"><input className="form-control" name="capacity" required type="number" min={1} max={30} defaultValue={12} /></Field>
                        <Field label="Horário de saída" icon="clock"><input className="form-control" name="departureTime" required type="time" defaultValue="17:30" /></Field>
                      </div>
                      <Field label="Cidades por onde passa" icon="location"><input className="form-control" name="cities" required placeholder="Separe as cidades por vírgula" /></Field>
                      <Field label="Faculdades que atende" icon="student"><input className="form-control" name="colleges" required placeholder="Separe as faculdades por vírgula" /></Field>
                    </>
                  )}
                  <label className="flex items-start gap-3 text-sm leading-6 text-slate-600">
                    <input className="mt-1 size-4 accent-blue-600" type="checkbox" required />
                    Aceito os termos de uso e a política de privacidade do RotaU.
                  </label>
                  {signupError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{signupError}</p>}
                  <button className="btn-primary w-full justify-center disabled:opacity-60" type="submit" disabled={submitting}>{submitting ? "Salvando..." : <>Criar conta como {profile === "student" ? "estudante" : "motorista"} <Icon name="arrow" /></>}</button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
