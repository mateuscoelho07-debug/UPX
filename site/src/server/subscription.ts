// Assinatura mensal do motorista: só motorista com a assinatura em dia aparece para os alunos.
// O pagamento ainda é SIMULADO (sem cobrança real); a validade fica em drivers.subscription_until.
import { addDays } from "./time.ts";

export type SubscriptionConfig = {
  enabled: boolean; // SUBSCRIPTION=off libera todas as vans, sem cobrança
  price: number; // reais por período (SUBSCRIPTION_PRICE)
  days: number; // dias que cada pagamento vale (SUBSCRIPTION_DAYS)
  warnDays: number; // quantos dias antes do vencimento o motorista é avisado
  simulated: boolean; // SUBSCRIPTION_PAYMENT=simulado (padrão) deixa assinar sem pagar de verdade
};

export type SubscriptionInfo = {
  enabled: boolean;
  price: number;
  days: number;
  simulated: boolean;
  until: string | null; // AAAA-MM-DD, vale até o fim desse dia
  active: boolean;
  daysLeft: number | null;
};

function positive(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function subscriptionConfig(env: NodeJS.ProcessEnv = process.env): SubscriptionConfig {
  return {
    enabled: env.SUBSCRIPTION !== "off",
    price: positive(env.SUBSCRIPTION_PRICE?.replace(",", "."), 29.9),
    days: Math.round(positive(env.SUBSCRIPTION_DAYS, 30)),
    warnDays: 3,
    simulated: (env.SUBSCRIPTION_PAYMENT ?? "simulado") === "simulado",
  };
}

// Motoristas de demonstração nunca vencem; com a cobrança desligada, ninguém vence
export function isSubscriptionActive(until: string | null, today: string, demo: boolean, config = subscriptionConfig()): boolean {
  return !config.enabled || demo || (until !== null && until >= today);
}

// Dias que faltam (0 = vence hoje, negativo = já venceu)
export function daysLeft(until: string, today: string): number {
  return Math.round((Date.parse(`${until}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

// Pagar antes do vencimento soma ao que sobrou; pagar depois conta a partir de hoje
export function renewedUntil(until: string | null, today: string, days: number): string {
  return addDays(until !== null && until >= today ? until : today, days);
}

export function subscriptionInfo(until: string | null, today: string, demo: boolean, config = subscriptionConfig()): SubscriptionInfo {
  return {
    enabled: config.enabled && !demo,
    price: config.price,
    days: config.days,
    simulated: config.simulated,
    until,
    active: isSubscriptionActive(until, today, demo, config),
    daysLeft: until === null ? null : daysLeft(until, today),
  };
}
