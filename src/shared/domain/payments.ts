/**
 * Оплата обучения. Все расчёты — в копейках (целые числа), чтобы избежать ошибок округления.
 *
 * Статус начисления:
 *  - paid    — оплачено полностью (по внесённым платежам);
 *  - partial — оплачено частично, срок не прошёл;
 *  - pending — платежей нет, срок не прошёл («ожидается оплата»);
 *  - overdue — срок прошёл, а остаток больше нуля.
 * Если платежи внесены вручную, статус «оплачено» означает «по вашим данным» — приложение
 * явно показывает, что университет это не подтверждал.
 */

import { rublesToKopecks } from './format';
import type { DataSource, Payment, TuitionPlan } from './models';
import { diffDaysBetweenKeys, type DateKey } from './time';

export type PlanStatus = 'paid' | 'partial' | 'pending' | 'overdue';

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  paid: 'Оплачено',
  partial: 'Частично оплачено',
  pending: 'Ожидается оплата',
  overdue: 'Просрочено',
};

export interface PlanSummary {
  dueKopecks: number;
  paidKopecks: number;
  confirmedKopecks: number;
  remainingKopecks: number;
  status: PlanStatus;
  /** Дней до срока (отрицательное — просрочено) */
  daysLeft: number;
  /** Все суммы подтверждены официальным источником */
  fullyConfirmed: boolean;
  /** Начисление внесено вручную (не из системы университета) */
  planSource: DataSource;
  progress: number;
}

export function summarizePlan(
  plan: Pick<TuitionPlan, 'amount_due' | 'due_date' | 'source'>,
  payments: readonly Pick<Payment, 'amount' | 'source'>[],
  todayKey: DateKey,
): PlanSummary {
  const dueKopecks = rublesToKopecks(plan.amount_due);
  let paidKopecks = 0;
  let confirmedKopecks = 0;
  for (const p of payments) {
    const amount = rublesToKopecks(p.amount);
    paidKopecks += amount;
    if (p.source === 'official') confirmedKopecks += amount;
  }
  const remainingKopecks = Math.max(0, dueKopecks - paidKopecks);
  const daysLeft = diffDaysBetweenKeys(todayKey, plan.due_date);
  let status: PlanStatus;
  if (remainingKopecks === 0) status = 'paid';
  else if (daysLeft < 0) status = 'overdue';
  else if (paidKopecks > 0) status = 'partial';
  else status = 'pending';
  return {
    dueKopecks,
    paidKopecks,
    confirmedKopecks,
    remainingKopecks,
    status,
    daysLeft,
    fullyConfirmed: plan.source === 'official' && confirmedKopecks === paidKopecks,
    planSource: plan.source,
    progress: dueKopecks > 0 ? Math.min(1, paidKopecks / dueKopecks) : 0,
  };
}

/** Начисление, о котором нужно напомнить на главном экране. */
export function planNeedsAttention(summary: PlanSummary, reminderDays: number): boolean {
  if (summary.status === 'paid') return false;
  return summary.status === 'overdue' || summary.daysLeft <= reminderDays;
}

/** Ближайшее неоплаченное начисление. */
export function nextUnpaidPlan<T extends TuitionPlan>(plans: readonly T[], todayKey: DateKey): { plan: T; summary: PlanSummary } | null {
  const candidates = plans
    .map((plan) => ({ plan, summary: summarizePlan(plan, plan.payments, todayKey) }))
    .filter((x) => x.summary.status !== 'paid')
    .sort((a, b) => a.plan.due_date.localeCompare(b.plan.due_date));
  return candidates[0] ?? null;
}

export function paymentConfirmationLabel(source: DataSource): string {
  switch (source) {
    case 'official':
      return 'Подтверждено университетом';
    case 'demo':
      return 'Демо-данные';
    default:
      return 'Внесено вами, университетом не подтверждено';
  }
}
