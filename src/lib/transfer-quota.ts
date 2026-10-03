import { prisma } from "@/lib/prisma";

export type TransferKind = "IMPORT" | "EXPORT";

function parisParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function parisMidnight(year: number, month: number, day: number) {
  // Le changement d'heure a lieu après minuit : l'offset de 00:00 UTC est celui du début de journée locale.
  const utcMidnight = new Date(Date.UTC(year, month - 1, day));
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "shortOffset" })
    .formatToParts(utcMidnight).find((part) => part.type === "timeZoneName")?.value;
  const hours = Number(offset?.match(/GMT\+(\d+)/)?.[1] ?? 1);
  return new Date(Date.UTC(year, month - 1, day) - hours * 3_600_000);
}

export function quotaPeriod(kind: TransferKind, now = new Date()) {
  const { year, month } = parisParts(now);
  const start = parisMidnight(year, month, 1);
  const end = parisMidnight(year, month + 1, 1);
  return { start, end, limit: 3 };
}

export async function transferUsage(userId: string, kind: TransferKind) {
  const { start, end, limit } = quotaPeriod(kind);
  const used = await prisma.dataTransfer.count({ where: { userId, kind, createdAt: { gte: start, lt: end } } });
  return { used, limit, remaining: Math.max(0, limit - used), resetsAt: end.toISOString() };
}
