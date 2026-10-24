// Datas e horários do RotaU no fuso de Brasília (o servidor da Vercel roda em UTC).
const TIME_ZONE = "America/Sao_Paulo";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const weekdays = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

// "2026-10-23"
export function localDay(date: Date): string {
  return dayFormat.format(date);
}

// "06:30"
export function localTime(date: Date): string {
  return timeFormat.format(date);
}

// Dia da semana de uma data AAAA-MM-DD
export function weekdayOf(day: string): string {
  return weekdays[new Date(`${day}T12:00:00Z`).getUTCDay()]!;
}

// O SQLite guarda datas em UTC ("2026-10-23 09:30:00")
export function fromSqlTime(value: string): Date {
  return new Date(value.replace(" ", "T") + "Z");
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

// "17:40" + 25 minutos = "18:05" (passa da meia-noite sem problemas)
export function clockPlus(clock: string, minutes: number): string {
  const [hours, mins] = clock.split(":").map(Number);
  const total = (((hours! * 60 + mins! + Math.round(minutes)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Soma dias a uma data AAAA-MM-DD
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
