import { useState } from 'react';

import { useToday } from '../hooks';
import { IS_PREVIEW } from '../lib/env';
import { isIos, isSafariBrowser, isStandalone, requestPersistentStorage, supportsBadge, updateAppBadge } from '../lib/platform';
import { useNav } from '../nav';
import type { ThemePreference } from '../shared/domain/models';
import { formatDurationMinutes } from '../shared/domain/format';
import { RUSSIAN_TIME_ZONES, timeZoneLabel } from '../shared/domain/timezones';
import { deviceTimeZone, type DateKey } from '../shared/domain/time';
import { seedDemo } from '../store/demo';
import { updateSettings, useData } from '../store/store';
import { DateInput, Select, TextInput, Toggle } from '../ui/form';
import { Icon } from '../ui/Icon';
import { Button, Card, Chip, ChipRow, Notice, Section, Segmented } from '../ui/kit';
import { Page } from '../ui/layout';
import { useOverlay } from '../ui/overlay';
import { academicWeekLabel } from './weeks';

function timeZoneOptions(current: string) {
  const list = [...RUSSIAN_TIME_ZONES];
  const device = deviceTimeZone();
  for (const tz of [current, device]) if (!list.some((z) => z.value === tz)) list.push({ value: tz, label: tz });
  return list;
}

export function SettingsScreen() {
  const data = useData();
  const s = data.settings;
  const overlay = useOverlay();
  const { today } = useToday();
  const week = academicWeekLabel(s.semesterStart, today);

  return (
    <Page title="Профиль и оформление">
      <div className="form">
        <TextInput label="Имя и фамилия" value={s.name} onChange={(v) => updateSettings({ name: v })} placeholder="Например: Анна Смирнова" autoComplete="name" hint="Имя используется в приветствии на главной." />
        <TextInput label="Группа" optional value={s.group} onChange={(v) => updateSettings({ group: v })} placeholder="Например: ГМУ-23-1" />
        <TextInput label="Институт или филиал" optional value={s.institution} onChange={(v) => updateSettings({ institution: v })} placeholder="Например: ИГСУ" />
        <Select label="Часовой пояс института" value={s.timeZone} onChange={(v) => updateSettings({ timeZone: v })} options={timeZoneOptions(s.timeZone)} />
        <p className="footnote">Время пар показывается по часовому поясу института, даже если телефон в другом городе.</p>
        <Select
          label="Длительность пары"
          value={String(s.pairMinutes)}
          onChange={(v) => updateSettings({ pairMinutes: Number(v) })}
          options={[45, 60, 80, 90, 95].map((m) => ({ value: String(m), label: m === 80 ? '1 ч 20 мин (обычная)' : formatDurationMinutes(m) }))}
        />
        <p className="footnote">При добавлении пары конец считается сам: начало + длительность. Для отдельной пары время можно изменить кнопкой «Сделать пару длиннее».</p>
        <DateInput label="Начало семестра" value={s.semesterStart ?? ''} onChange={(v) => updateSettings({ semesterStart: (v || null) as DateKey | null })} />
        <p className="footnote">
          {week ? `Сейчас ${week}. ` : ''}Нужно для номера учебной недели и чётности (числитель/знаменатель — по правилам вашего института).{' '}
          {s.semesterStart ? (
            <button type="button" className="link-btn" onClick={() => updateSettings({ semesterStart: null })}>
              Не показывать неделю
            </button>
          ) : null}
        </p>
      </div>
      <Section title="Оформление">
        <Segmented<ThemePreference>
          label="Тема"
          value={s.theme}
          onChange={(v) => updateSettings({ theme: v })}
          options={[
            { value: 'system', label: 'Как в системе' },
            { value: 'light', label: 'Светлая' },
            { value: 'dark', label: 'Тёмная' },
          ]}
        />
      </Section>
      {supportsBadge() && isStandalone() ? (
        <Section title="Значок на иконке">
          <Card>
            <Toggle
              label="Число срочных заданий"
              hint="Просроченные и со сроком сегодня. Обновляется, когда вы открываете приложение. Нужно разрешение на уведомления."
              checked={s.badge}
              onChange={async (v) => {
                if (v) {
                  const permission = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
                  if (permission !== 'granted') {
                    overlay.toast('Разрешите уведомления для приложения в Настройках iPhone', 'error');
                    return;
                  }
                } else void updateAppBadge(0);
                updateSettings({ badge: v });
              }}
            />
          </Card>
        </Section>
      ) : null}
    </Page>
  );
}

const CLASS_REMINDERS = [0, 5, 10, 15, 30, 60].map((m) => ({ value: String(m), label: m === 0 ? 'Без напоминания' : `За ${m} мин` }));
const DEADLINE_OPTIONS = [
  { minutes: 4320, label: 'За 3 дня' },
  { minutes: 1440, label: 'За сутки' },
  { minutes: 180, label: 'За 3 часа' },
  { minutes: 60, label: 'За час' },
];
const DAY_OPTIONS = [0, 1, 2, 3, 5, 7, 14].map((d) => ({ value: String(d), label: d === 0 ? 'Без напоминания' : `За ${d} ${d === 1 ? 'день' : d < 5 ? 'дня' : 'дней'}` }));
const HOUR_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 7).map((h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }));

export function RemindersScreen() {
  const nav = useNav();
  const s = useData().settings;
  return (
    <Page title="Напоминания">
      <Notice tone="primary" icon="bell" title="Как работают напоминания на iPhone">
        Веб-приложение без сервера не может присылать уведомления, когда оно закрыто. Поэтому напоминания ставит Календарь iPhone: экспортируйте пары и дедлайны, и он уведомит вас в нужное время. Настройки ниже определяют, за сколько до события сработает напоминание.
      </Notice>
      <div className="form">
        <Select label="Пары" value={String(s.classReminderMinutes)} onChange={(v) => updateSettings({ classReminderMinutes: Number(v) })} options={CLASS_REMINDERS} />
        <p className="field-label">Дедлайны</p>
        <ChipRow label="Напоминания о дедлайнах">
          {DEADLINE_OPTIONS.map((o) => {
            const on = s.deadlineReminderMinutes.includes(o.minutes);
            return (
              <Chip
                key={o.minutes}
                label={o.label}
                selected={on}
                onClick={() =>
                  updateSettings({
                    deadlineReminderMinutes: on ? s.deadlineReminderMinutes.filter((m) => m !== o.minutes) : [...s.deadlineReminderMinutes, o.minutes].sort((a, b) => b - a),
                  })
                }
              />
            );
          })}
        </ChipRow>
        <Select label="Экзамены и зачёты" value={String(s.examReminderDays)} onChange={(v) => updateSettings({ examReminderDays: Number(v) })} options={DAY_OPTIONS} />
        <Select label="Оплата обучения" value={String(s.paymentReminderDays)} onChange={(v) => updateSettings({ paymentReminderDays: Number(v) })} options={DAY_OPTIONS} />
        <Select label="Время напоминаний об оплате" value={String(s.reminderHour)} onChange={(v) => updateSettings({ reminderHour: Number(v) })} options={HOUR_OPTIONS} />
        <p className="footnote">Напоминание об оплате на главной экране появляется за столько же дней до срока.</p>
      </div>
      <div className="form-actions">
        <Button full icon="calendar" onClick={() => nav.push({ name: 'export' })}>
          Добавить в Календарь iPhone
        </Button>
      </div>
    </Page>
  );
}

export function InstallSteps() {
  return (
    <ol className="steps">
      <li>
        <span className="step-num">1</span>
        <span>
          Откройте эту страницу именно в <b>Safari</b>. Если ссылка открылась в Telegram, ВКонтакте или другом приложении, нажмите «Открыть в Safari».
        </span>
      </li>
      <li>
        <span className="step-num">2</span>
        <span>
          Нажмите <b>«Поделиться»</b> <Icon name="share" size={16} /> — в iOS 26 она в меню <b>«•••»</b> справа от адресной строки, в iOS 18 и раньше — на нижней панели.
        </span>
      </li>
      <li>
        <span className="step-num">3</span>
        <span>
          Прокрутите список и выберите <b>«На экран „Домой“»</b>.
        </span>
      </li>
      <li>
        <span className="step-num">4</span>
        <span>
          Оставьте включённым <b>«Открыть как веб-приложение»</b> (если есть такой переключатель) и нажмите <b>«Добавить»</b>.
        </span>
      </li>
      <li>
        <span className="step-num">5</span>
        <span>Откройте приложение с иконки на экране «Домой» и заполняйте расписание уже там.</span>
      </li>
    </ol>
  );
}

export function InstallScreen() {
  const standalone = isStandalone();
  return (
    <Page title="Установка на iPhone">
      {standalone ? (
        <Notice tone="success" icon="check" title="Приложение установлено">
          Вы открыли его с экрана «Домой»: оно работает без панелей Safari и без интернета.
        </Notice>
      ) : null}
      {!standalone && isIos() && !isSafariBrowser() ? (
        <Notice tone="warning" icon="alert" title="Откройте в Safari">
          Добавить приложение на экран «Домой» можно только из Safari.
        </Notice>
      ) : null}
      <Card>
        <InstallSteps />
      </Card>
      <Section title="Важно о данных">
        <Card>
          <ul className="bullets">
            <li>Данные во вкладке Safari и в установленном приложении хранятся отдельно. Если уже что-то заполнили в Safari, сохраните резервную копию и восстановите её в установленном приложении.</li>
            <li>Если удалить иконку с экрана «Домой», данные приложения удалятся вместе с ней.</li>
            <li>Регулярно сохраняйте резервную копию в «Файлы» или iCloud Drive.</li>
          </ul>
        </Card>
      </Section>
    </Page>
  );
}

export function AboutScreen() {
  return (
    <Page title="О приложении">
      <div className="about-mark" aria-hidden="true">
        <BrandMark size={72} />
      </div>
      <h2 className="about-title">RANEPA Student</h2>
      <p className="muted-text center">Версия 1.0 · веб-приложение</p>
      <Card>
        <ul className="bullets">
          <li>Неофициальное приложение. Оно не связано с РАНХиГС и не получает данные из систем университета — открытого API у них нет.</li>
          <li>Расписание, задания, оценки и платежи вводите вы сами или загружаете из файла. У записей есть пометки: «Импорт», «Демо»; без пометки — введено вручную.</li>
          <li>Средний балл и посещаемость считаются по вашим записям и показанным формулам — это не официальные показатели.</li>
          <li>Приложение не принимает оплату, не хранит данные карт и не запрашивает логины и пароли от университетских сервисов.</li>
          <li>Все данные хранятся только на вашем устройстве и никуда не отправляются.</li>
          <li>Логотип и символика университета не используются.</li>
        </ul>
      </Card>
    </Page>
  );
}

export function BrandMark({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="brand-mark">
      <rect width="64" height="64" rx="15" fill="#3B5BBF" />
      <path d="M12 20.5c6-2.8 12.3-2.5 18.6 1.1v25.2c-6.3-3.6-12.6-3.9-18.6-1.1z" fill="#FFFFFF" />
      <path d="M52 20.5c-6-2.8-12.3-2.5-18.6 1.1v25.2c6.3-3.6 12.6-3.9 18.6-1.1z" fill="#DCE4FA" />
      <path d="M38.5 18.2h6.4v15.2l-3.2-2.6-3.2 2.6z" fill="#D2557A" />
    </svg>
  );
}

// ─── Первый запуск ──────────────────────────────────────────────────────────

export function Onboarding() {
  const { timeZone: currentTz } = useToday();
  const data = useData();
  const device = deviceTimeZone();
  const initialTz = RUSSIAN_TIME_ZONES.some((z) => z.value === device) ? device : currentTz;
  const [step, setStep] = useState<'welcome' | 'profile'>('welcome');
  const [name, setName] = useState(data.settings.name);
  const [group, setGroup] = useState(data.settings.group);
  const [institution, setInstitution] = useState(data.settings.institution);
  const [tz, setTz] = useState(initialTz);
  const standalone = isStandalone();

  const finish = (demo: boolean) => {
    updateSettings({ name: name.trim(), group: group.trim(), institution: institution.trim(), timeZone: tz, onboarded: true });
    if (demo) seedDemo(tz);
    void requestPersistentStorage();
  };

  if (step === 'welcome') {
    return (
      <main className="onboarding">
        <div className="onboarding-hero">
          <BrandMark size={84} />
          <h1 className="onboarding-title">RANEPA Student</h1>
          <p className="onboarding-text">Расписание, дедлайны, посещаемость, оценки и оплата обучения — в одном месте.</p>
        </div>
        <ul className="feature-list">
          <li>
            <Icon name="schedule" /> Пары на день и неделю, отмены и переносы
          </li>
          <li>
            <Icon name="tasks" /> Задания со сроками и напоминаниями через Календарь
          </li>
          <li>
            <Icon name="chart" /> Посещаемость и средний балл по понятным формулам
          </li>
          <li>
            <Icon name="data" /> Работает без интернета, данные остаются на телефоне
          </li>
        </ul>
        {!IS_PREVIEW && !standalone && isIos() ? (
          <Notice tone="primary" icon="phone" title="Сначала добавьте на экран «Домой»">
            <InstallSteps />
          </Notice>
        ) : null}
        <p className="footnote center">Неофициальное приложение. Не связано с РАНХиГС и не получает данные из систем университета.</p>
        <Button full onClick={() => setStep('profile')}>
          {IS_PREVIEW || standalone || !isIos() ? 'Начать' : 'Продолжить в Safari'}
        </Button>
      </main>
    );
  }

  return (
    <main className="onboarding">
      <h1 className="onboarding-title small">О вас</h1>
      <div className="form">
        <TextInput label="Имя и фамилия" value={name} onChange={setName} placeholder="Например: Анна Смирнова" autoComplete="name" />
        <TextInput label="Группа" optional value={group} onChange={setGroup} placeholder="Например: ГМУ-23-1" />
        <TextInput label="Институт или филиал" optional value={institution} onChange={setInstitution} placeholder="Например: ИГСУ" />
        <Select label="Часовой пояс института" value={tz} onChange={setTz} options={timeZoneOptions(tz)} />
        <p className="footnote">По умолчанию — {timeZoneLabel(tz)}. Его можно поменять в настройках.</p>
      </div>
      <div className="stack">
        <Button full onClick={() => finish(false)}>
          Начать с пустого расписания
        </Button>
        <Button full variant="secondary" onClick={() => finish(true)}>
          Посмотреть на демо-данных
        </Button>
        <p className="footnote center">Демо-данные помечены и удаляются одной кнопкой.</p>
      </div>
    </main>
  );
}
