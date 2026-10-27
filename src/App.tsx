import { useEffect, useMemo, useState } from 'react';

import { isStandalone, supportsBadge, updateAppBadge } from './lib/platform';
import { NavProvider, useNav, type Route, type Tab } from './nav';
import { CalendarScreen, EventDetailScreen, EventFormScreen } from './screens/Calendar';
import { ClassDetailScreen, ClassFormScreen } from './screens/ClassScreens';
import { DataScreen, ExportScreen, ImportScreen } from './screens/DataScreens';
import { HomeScreen } from './screens/Home';
import { PaymentFormScreen, PaymentsScreen, PlanFormScreen } from './screens/Money';
import { MoreScreen } from './screens/More';
import { ScheduleScreen } from './screens/Schedule';
import { SearchScreen } from './screens/Search';
import { AboutScreen, InstallScreen, Onboarding, RemindersScreen, SettingsScreen } from './screens/SettingsScreens';
import { AttendanceFormScreen, AttendanceScreen, ExamFormScreen, ExamsScreen, GradesScreen, SubjectPointsScreen } from './screens/Study';
import { SubjectDetailScreen, SubjectFormScreen, SubjectsScreen, TeacherFormScreen } from './screens/Subjects';
import { TaskDetailScreen, TaskFormScreen, TasksScreen } from './screens/Tasks';
import { countAssignments } from './shared/domain/assignments';
import { addDaysToKey, startOfDayUtc, toDateKey } from './shared/domain/time';
import { useModel } from './store/model';
import { useData, useSaveError } from './store/store';
import { Icon, type IconName } from './ui/Icon';
import { cx } from './ui/kit';
import { useLeavingLayers } from './ui/motion';
import { OverlayProvider } from './ui/overlay';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home', label: 'Главная', icon: 'home' },
  { id: 'schedule', label: 'Расписание', icon: 'schedule' },
  { id: 'tasks', label: 'Задания', icon: 'tasks' },
  { id: 'calendar', label: 'Календарь', icon: 'calendar' },
  { id: 'more', label: 'Ещё', icon: 'more' },
];

function renderRoute(route: Route) {
  switch (route.name) {
    case 'class':
      return <ClassDetailScreen id={route.id} />;
    case 'classForm':
      return <ClassFormScreen id={route.id} date={route.date} subjectId={route.subjectId} scope={route.scope} />;
    case 'task':
      return <TaskDetailScreen id={route.id} />;
    case 'taskForm':
      return <TaskFormScreen id={route.id} subjectId={route.subjectId} date={route.date} />;
    case 'attendance':
      return <AttendanceScreen />;
    case 'attendanceForm':
      return <AttendanceFormScreen id={route.id} />;
    case 'grades':
      return <GradesScreen />;
    case 'gradeSubject':
      return <SubjectPointsScreen subjectId={route.subjectId} />;
    case 'exams':
      return <ExamsScreen />;
    case 'examForm':
      return <ExamFormScreen id={route.id} />;
    case 'payments':
      return <PaymentsScreen />;
    case 'planForm':
      return <PlanFormScreen id={route.id} />;
    case 'paymentForm':
      return <PaymentFormScreen planId={route.planId} id={route.id} />;
    case 'subjects':
      return <SubjectsScreen tab={route.tab} />;
    case 'teacherForm':
      return <TeacherFormScreen id={route.id} />;
    case 'subject':
      return <SubjectDetailScreen id={route.id} />;
    case 'subjectForm':
      return <SubjectFormScreen id={route.id} />;
    case 'event':
      return <EventDetailScreen id={route.id} />;
    case 'eventForm':
      return <EventFormScreen id={route.id} date={route.date} />;
    case 'import':
      return <ImportScreen />;
    case 'export':
      return <ExportScreen />;
    case 'data':
      return <DataScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'reminders':
      return <RemindersScreen />;
    case 'install':
      return <InstallScreen />;
    case 'about':
      return <AboutScreen />;
    case 'search':
      return <SearchScreen />;
  }
}

function routeKey(route: Route, index: number): string {
  return `${index}:${route.name}:${'id' in route ? (route.id ?? '') : ''}`;
}

function Shell() {
  const nav = useNav();
  const saveError = useSaveError();
  const model = useModel();
  const settings = model.data.settings;
  const top = nav.stack.length;
  const layers = useLeavingLayers(nav.stack, routeKey);

  // Число срочных заданий на значке приложения (iOS 16.4+, установленное приложение).
  useEffect(() => {
    if (!settings.badge || !supportsBadge() || !isStandalone()) return;
    const now = new Date();
    const today = toDateKey(now, settings.timeZone);
    const c = countAssignments(model.assignments, now, startOfDayUtc(addDaysToKey(today, 1), settings.timeZone));
    void updateAppBadge(c.overdue + c.dueToday);
  }, [model.assignments, settings.badge, settings.timeZone]);

  const tabContent = useMemo(() => {
    switch (nav.tab) {
      case 'home':
        return <HomeScreen />;
      case 'schedule':
        return <ScheduleScreen />;
      case 'tasks':
        return <TasksScreen />;
      case 'calendar':
        return <CalendarScreen />;
      case 'more':
        return <MoreScreen />;
    }
  }, [nav.tab]);

  return (
    <>
      <div className="tab-layer" aria-hidden={top > 0} inert={top > 0}>
        {saveError ? (
          <div className="save-error" role="alert">
            <Icon name="alert" size={18} /> {saveError}
          </div>
        ) : null}
        <div key={nav.tab} className="tab-anim">
          {tabContent}
        </div>
        <nav className="tab-bar" aria-label="Разделы">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={cx('tab', nav.tab === t.id && 'is-active')} aria-current={nav.tab === t.id ? 'page' : undefined} onClick={() => nav.setTab(t.id)}>
              <Icon name={t.icon} size={24} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>
      {layers.map((layer) => {
        const isTop = !layer.leaving && layer.index === top - 1;
        return (
          <div key={layer.key} className={cx('page-layer', isTop && 'is-top', layer.leaving && 'is-leaving')} aria-hidden={!isTop} inert={!isTop}>
            {renderRoute(layer.item)}
          </div>
        );
      })}
    </>
  );
}

function useThemeAttribute(theme: 'system' | 'light' | 'dark') {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
}

export function App() {
  const data = useData();
  useThemeAttribute(data.settings.theme);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const onUpdate = () => setUpdateReady(true);
    window.addEventListener('app-update-ready', onUpdate);
    return () => window.removeEventListener('app-update-ready', onUpdate);
  }, []);

  return (
    <OverlayProvider>
      {updateReady ? (
        <button type="button" className="update-banner" onClick={() => window.dispatchEvent(new Event('app-apply-update'))}>
          <Icon name="refresh" size={18} /> Доступна новая версия — нажмите, чтобы обновить
        </button>
      ) : null}
      {data.settings.onboarded ? (
        <NavProvider>
          <Shell />
        </NavProvider>
      ) : (
        <Onboarding />
      )}
    </OverlayProvider>
  );
}
