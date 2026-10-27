/** Оплата обучения: начисления и внесённые платежи. Приложение не принимает оплату. */
import { useState } from 'react';

import { useToday } from '../hooks';
import { isHttpsUrl, openExternal } from '../lib/platform';
import { useNav } from '../nav';
import { formatMoneyKopecks, parseMoneyInput } from '../shared/domain/format';
import { paymentConfirmationLabel, PLAN_STATUS_LABELS, summarizePlan, type PlanStatus } from '../shared/domain/payments';
import { formatDayMonth, formatFullDate, formatRelativeDay, type DateKey } from '../shared/domain/time';
import { deletePayment, deletePlan, savePayment, savePlan } from '../store/actions';
import { useModel } from '../store/model';
import { newId } from '../store/store';
import { DateInput, FormError, TextArea, TextInput } from '../ui/form';
import { Badge, Button, Card, Empty, List, Notice, ProgressBar, Row, Section, SourceBadge, type Tone } from '../ui/kit';
import { NavAction, Page } from '../ui/layout';
import { useOverlay } from '../ui/overlay';

const STATUS_TONE: Record<PlanStatus, Tone> = { paid: 'success', partial: 'warning', pending: 'primary', overdue: 'danger' };

export function PaymentsScreen() {
  const nav = useNav();
  const model = useModel();
  const { today } = useToday();

  return (
    <Page title="Оплата обучения" right={<NavAction label="Добавить" onClick={() => nav.push({ name: 'planForm' })} />}>
      <Notice tone="neutral" icon="info" title="Только учёт: оплата — на официальном сайте" />
      {model.plans.length === 0 ? (
        <Empty
          icon="wallet"
          title="Начислений пока нет"
          text="Добавьте сумму и срок из договора."
          action={{ label: 'Добавить начисление', onClick: () => nav.push({ name: 'planForm' }) }}
        />
      ) : (
        model.plans.map((plan) => {
          const s = summarizePlan(plan, plan.payments, today);
          return (
            <Section key={plan.id}>
              <Card>
                <div className="plan-head">
                  <div>
                    <p className="plan-title">{plan.title}</p>
                    <p className="plan-meta">Срок: {formatFullDate(plan.due_date)} · {s.status === 'paid' ? 'оплачено' : formatRelativeDay(plan.due_date, today).toLowerCase()}</p>
                  </div>
                  <Badge tone={STATUS_TONE[s.status]}>{PLAN_STATUS_LABELS[s.status]}</Badge>
                </div>
                <div className="plan-sums">
                  <div>
                    <span className="plan-sum">{formatMoneyKopecks(s.paidKopecks)}</span>
                    <span className="plan-sum-label">внесено из {formatMoneyKopecks(s.dueKopecks)}</span>
                  </div>
                  {s.remainingKopecks > 0 ? (
                    <div className="right">
                      <span className="plan-sum accent">{formatMoneyKopecks(s.remainingKopecks)}</span>
                      <span className="plan-sum-label">осталось</span>
                    </div>
                  ) : null}
                </div>
                <ProgressBar value={s.progress} tone={STATUS_TONE[s.status]} label="Доля оплаты" />
                <div className="inline-actions">
                  <Button size="sm" icon="plus" onClick={() => nav.push({ name: 'paymentForm', planId: plan.id })}>
                    Внести платёж
                  </Button>
                  {plan.payment_url ? (
                    <Button size="sm" variant="secondary" icon="link" onClick={() => plan.payment_url && openExternal(plan.payment_url)}>
                      Официальная оплата
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" icon="edit" onClick={() => nav.push({ name: 'planForm', id: plan.id })}>
                    Изменить
                  </Button>
                </div>
              </Card>
              {plan.payments.length > 0 ? (
                <List>
                  {plan.payments.map((p) => (
                    <Row
                      key={p.id}
                      title={formatMoneyKopecks(Math.round(p.amount * 100))}
                      subtitle={`${formatDayMonth(p.paid_on)} · ${paymentConfirmationLabel(p.source)}${p.note ? ` · ${p.note}` : ''}`}
                      right={<SourceBadge source={p.source} />}
                      onClick={() => nav.push({ name: 'paymentForm', planId: plan.id, id: p.id })}
                    />
                  ))}
                </List>
              ) : null}
            </Section>
          );
        })
      )}
    </Page>
  );
}

export function PlanFormScreen({ id }: { id?: string }) {
  const nav = useNav();
  const model = useModel();
  const overlay = useOverlay();
  const { today } = useToday();
  const existing = id ? model.data.plans.find((p) => p.id === id) : undefined;
  const [title, setTitle] = useState(existing?.title ?? 'Оплата семестра');
  const [amount, setAmount] = useState(existing ? String(existing.amount_due).replace('.', ',') : '');
  const [due, setDue] = useState<DateKey>(existing?.due_date ?? today);
  const [url, setUrl] = useState(existing?.payment_url ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (title.trim().length < 2) return setError('Введите название');
    const kopecks = parseMoneyInput(amount);
    if (kopecks === null || kopecks <= 0) return setError('Введите сумму, например 75 000');
    if (url.trim() && !isHttpsUrl(url.trim())) return setError('Ссылка на оплату должна начинаться с https://');
    savePlan({
      id: existing?.id ?? newId(),
      title: title.trim(),
      amount_due: kopecks / 100,
      due_date: due,
      payment_url: url.trim() || null,
      note: note.trim() || null,
      source: existing?.source === 'demo' ? 'manual' : (existing?.source ?? 'manual'),
    });
    overlay.toast('Сохранено');
    nav.back();
  };

  return (
    <Page title={existing ? 'Начисление' : 'Новое начисление'} backLabel="Отмена" right={<NavAction label="Сохранить" onClick={save} />}>
      <div className="form">
        <TextInput label="Название" value={title} onChange={setTitle} placeholder="Например: оплата весеннего семестра" />
        <TextInput label="Сумма, ₽" inputMode="decimal" value={amount} onChange={setAmount} placeholder="75 000" />
        <DateInput label="Оплатить до" value={due} onChange={setDue} />
        <TextInput
          label="Ссылка на официальную оплату"
          optional
          type="url"
          inputMode="url"
          value={url}
          onChange={setUrl}
          placeholder="https://"
          hint="Адрес страницы оплаты из договора или с сайта университета. Откроется в Safari."
        />
        <TextArea label="Заметки" optional value={note} onChange={setNote} rows={2} />
        <FormError message={error} />
      </div>
      <div className="form-actions">
        <Button full icon="check" onClick={save}>
          Сохранить
        </Button>
        {existing ? (
          <Button
            full
            variant="ghost"
            onClick={async () => {
              if (await overlay.confirm({ title: 'Удалить начисление?', message: 'Вместе с ним удалятся внесённые платежи.', confirmLabel: 'Удалить', danger: true })) {
                deletePlan(existing.id);
                overlay.toast('Удалено');
                nav.back();
              }
            }}
          >
            Удалить начисление
          </Button>
        ) : null}
      </div>
    </Page>
  );
}

export function PaymentFormScreen({ planId, id }: { planId: string; id?: string }) {
  const nav = useNav();
  const model = useModel();
  const overlay = useOverlay();
  const { today } = useToday();
  const plan = model.plans.find((p) => p.id === planId);
  const existing = id ? model.data.payments.find((p) => p.id === id) : undefined;
  const remaining = plan ? summarizePlan(plan, plan.payments.filter((p) => p.id !== id), today).remainingKopecks : 0;
  const [amount, setAmount] = useState(existing ? String(existing.amount).replace('.', ',') : remaining > 0 ? String(remaining / 100).replace('.', ',') : '');
  const [day, setDay] = useState<DateKey>(existing?.paid_on ?? today);
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  if (!plan) {
    return (
      <Page title="Платёж">
        <Empty icon="wallet" title="Начисление не найдено" />
      </Page>
    );
  }

  const save = () => {
    const kopecks = parseMoneyInput(amount);
    if (kopecks === null || kopecks <= 0) return setError('Введите сумму платежа');
    savePayment({ id: existing?.id ?? newId(), plan_id: planId, amount: kopecks / 100, paid_on: day, note: note.trim() || null, source: existing?.source === 'demo' ? 'manual' : (existing?.source ?? 'manual') });
    overlay.toast('Платёж записан');
    nav.back();
  };

  return (
    <Page title={existing ? 'Платёж' : 'Новый платёж'} backLabel="Отмена" right={<NavAction label="Сохранить" onClick={save} />}>
      <div className="form">
        <p className="muted-text">{plan.title}</p>
        <TextInput label="Сумма, ₽" inputMode="decimal" value={amount} onChange={setAmount} />
        <DateInput label="Дата оплаты" value={day} onChange={setDay} max={today} />
        <TextInput label="Комментарий" optional value={note} onChange={setNote} placeholder="Например: номер квитанции" />
        <p className="footnote">Запись нужна для вашего учёта. Она не означает, что университет получил оплату — проверяйте поступление в личном кабинете или по квитанции.</p>
        <FormError message={error} />
      </div>
      <div className="form-actions">
        <Button full icon="check" onClick={save}>
          Сохранить
        </Button>
        {existing ? (
          <Button
            full
            variant="ghost"
            onClick={() => {
              deletePayment(existing.id);
              overlay.toast('Платёж удалён');
              nav.back();
            }}
          >
            Удалить платёж
          </Button>
        ) : null}
      </div>
    </Page>
  );
}
