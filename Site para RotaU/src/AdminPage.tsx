// Página de administração (/admin): mostra o conteúdo do banco, somente leitura.
// ATENÇÃO: ainda não há login. Use localmente; antes de publicar o site,
// defina ADMIN_TOKEN no servidor ou implemente autenticação de verdade.
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, type AdminOverview, type AdminRow } from "./api";

type TableKey = "colleges" | "students" | "drivers" | "bookings" | "searches";

const tables: { key: TableKey; label: string; columns: [string, string][] }[] = [
  {
    key: "students",
    label: "Estudantes",
    columns: [["id", "ID"], ["name", "Nome"], ["email", "E-mail"], ["phone", "Celular"], ["address", "Endereço"], ["college", "Faculdade"], ["createdAt", "Cadastro"]],
  },
  {
    key: "drivers",
    label: "Motoristas",
    columns: [["id", "ID"], ["name", "Nome"], ["email", "E-mail"], ["phone", "Celular"], ["vanModel", "Van"], ["plate", "Placa"], ["occupied", "Ocupados"], ["capacity", "Lugares"], ["departureTime", "Saída"], ["rating", "Nota"], ["cities", "Cidades"], ["colleges", "Faculdades"], ["createdAt", "Cadastro"]],
  },
  {
    key: "bookings",
    label: "Reservas",
    columns: [["id", "ID"], ["student", "Estudante"], ["driver", "Motorista"], ["pickup", "Embarque"], ["pickupTime", "Horário"], ["status", "Status"], ["createdAt", "Criada em"]],
  },
  {
    key: "colleges",
    label: "Faculdades",
    columns: [["id", "ID"], ["name", "Nome"], ["students", "Estudantes"], ["drivers", "Motoristas"]],
  },
  {
    key: "searches",
    label: "Buscas",
    columns: [["id", "ID"], ["address", "Endereço"], ["college", "Faculdade"], ["results", "Vans encontradas"], ["createdAt", "Data"]],
  },
];

const statusStyles: Record<string, string> = {
  Confirmado: "bg-emerald-50 text-emerald-700",
  Aguardando: "bg-amber-50 text-amber-700",
  Cancelado: "bg-slate-100 text-slate-500",
};

// O SQLite guarda datas em UTC ("2026-10-22 18:00:00"); mostra no horário local
function formatCell(column: string, value: AdminRow[string]) {
  if (value === null || value === undefined || value === "") return "—";
  if (column === "createdAt" && typeof value === "string") {
    const date = new Date(value.replace(" ", "T") + "Z");
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
  }
  if (column === "rating" && typeof value === "number") return value.toFixed(1).replace(".", ",");
  return String(value);
}

function readToken() {
  try {
    return sessionStorage.getItem("rotau.adminToken") ?? "";
  } catch {
    return "";
  }
}

export default function AdminPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [active, setActive] = useState<TableKey>("students");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(readToken);
  const [needsToken, setNeedsToken] = useState(false);

  const load = useCallback((currentToken: string) => {
    setLoading(true);
    setError(null);
    api.adminOverview(currentToken || undefined)
      .then((overview) => {
        setData(overview);
        setNeedsToken(false);
      })
      .catch((err: Error) => {
        if (err.message.includes("Token")) setNeedsToken(true);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(readToken()), [load]);

  function submitToken(event: FormEvent) {
    event.preventDefault();
    try {
      sessionStorage.setItem("rotau.adminToken", token);
    } catch {
      // sem armazenamento: o token vale só nesta visita
    }
    load(token);
  }

  const table = tables.find((item) => item.key === active)!;
  const term = filter.trim().toLowerCase();
  const rows = (data?.[active] ?? []).filter((row) =>
    !term || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(term)),
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-2.5">
            <img className="h-11 w-16 rounded-xl object-cover shadow-lg shadow-blue-200" src="/rotau-logo.png" alt="" />
            <span className="text-xl font-extrabold tracking-tight text-slate-950">
              Rota<span className="text-blue-600">U</span>
            </span>
            <span className="ml-2 hidden rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white sm:inline">Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-secondary whitespace-nowrap !px-4 !py-2.5 text-sm" onClick={() => load(token)} disabled={loading}>
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
            <a className="btn-secondary whitespace-nowrap !px-4 !py-2.5 text-sm" href="/">Ver site</a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
        <span className="section-tag">Banco de dados</span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Painel de administração</h1>
        <p className="mt-2 text-slate-600">Tudo o que está salvo no banco do RotaU, somente para consulta.</p>

        {data && !data.protected && (
          <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <strong>Uso local:</strong> este painel ainda não tem login. Antes de colocar o site no ar, defina a variável <code className="font-mono">ADMIN_TOKEN</code> no servidor para exigir uma senha.
          </p>
        )}

        {needsToken && (
          <form className="mt-6 flex max-w-md gap-3" onSubmit={submitToken}>
            <input className="form-control !pl-4" type="password" placeholder="Token de administrador" value={token} onChange={(e) => setToken(e.target.value)} />
            <button className="btn-primary" type="submit">Entrar</button>
          </form>
        )}

        {error && !needsToken && (
          <p className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">{error}</p>
        )}

        {data && (
          <>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {tables.map((item) => (
                <button
                  key={item.key}
                  className={`rounded-2xl border p-4 text-left transition ${active === item.key ? "border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-900/10" : "border-slate-200 bg-white hover:border-blue-200"}`}
                  onClick={() => setActive(item.key)}
                >
                  <span className={`block text-sm font-semibold ${active === item.key ? "text-blue-50" : "text-slate-500"}`}>{item.label}</span>
                  <strong className="mt-1 block text-2xl font-extrabold">{data[item.key].length}</strong>
                </button>
              ))}
            </div>

            <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-blue-900/5">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-extrabold text-slate-950">{table.label}</h2>
                <input
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-400 sm:w-72"
                  placeholder="Filtrar..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
                    <tr>{table.columns.map(([key, label]) => <th className="whitespace-nowrap px-4 py-3" key={key}>{label}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr className="hover:bg-slate-50" key={String(row.id)}>
                        {table.columns.map(([key]) => (
                          <td className="whitespace-nowrap px-4 py-3 text-slate-700" key={key}>
                            {key === "status" ? (
                              <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusStyles[String(row.status)] ?? ""}`}>{formatCell(key, row[key])}</span>
                            ) : formatCell(key, row[key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && <p className="px-6 py-10 text-center text-sm text-slate-500">Nenhum registro{term ? " para esse filtro" : ""}.</p>}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
