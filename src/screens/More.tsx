import { useNav } from '../nav';
import { initials } from '../shared/domain/format';
import { signOut } from '../store/actions';
import { useData } from '../store/store';
import { useOverlay } from '../ui/overlay';
import { updateAppBadge } from '../lib/platform';
import { List, Row, Section } from '../ui/kit';
import { TabScreen } from '../ui/layout';
import { isStandalone } from '../lib/platform';

export function MoreScreen() {
  const nav = useNav();
  const data = useData();
  const overlay = useOverlay();
  const s = data.settings;

  const logout = async () => {
    const backedUp = Boolean(data.lastBackupAt);
    const choice = await overlay.choose<'backup' | 'out'>(
      'Выйти из профиля?',
      [
        { label: 'Сначала сохранить копию', value: 'backup' },
        { label: 'Выйти и удалить данные', value: 'out', danger: true },
      ],
      backedUp
        ? 'Профиль и все записи будут удалены с этого телефона. Вернуть их можно из резервной копии.'
        : 'Профиль и все записи будут удалены с этого телефона. Резервной копии ещё нет — без неё данные не вернуть.',
    );
    if (choice === 'backup') {
      nav.push({ name: 'export' });
      return;
    }
    if (choice !== 'out') return;
    nav.reset('home');
    signOut();
    void updateAppBadge(0);
    overlay.toast('Вы вышли из профиля');
  };
  return (
    <TabScreen title="Ещё">
      <button type="button" className="profile-card" onClick={() => nav.push({ name: 'settings' })}>
        <span className="avatar" aria-hidden="true">
          {s.name ? initials(s.name) : '?'}
        </span>
        <span className="profile-text">
          <span className="profile-name">{s.name || 'Укажите имя'}</span>
          <span className="profile-meta">{[s.group && `Группа ${s.group}`, s.institution].filter(Boolean).join(' · ') || 'Группа и институт не указаны'}</span>
        </span>
      </button>

      <Section title="Учёба">
        <List>
          <Row icon="users" title="Посещаемость" onClick={() => nav.push({ name: 'attendance' })} />
          <Row icon="chart" title="Моя успеваемость" onClick={() => nav.push({ name: 'grades' })} />
          <Row icon="award" title="Сессия и экзамены" onClick={() => nav.push({ name: 'exams' })} />
          <Row icon="wallet" title="Оплата обучения" onClick={() => nav.push({ name: 'payments' })} />
          <Row icon="layers" title="Дисциплины" value={String(data.subjects.length)} onClick={() => nav.push({ name: 'subjects' })} />
          <Row icon="search" title="Поиск" onClick={() => nav.push({ name: 'search' })} />
        </List>
      </Section>

      <Section title="Данные">
        <List>
          <Row icon="upload" title="Импорт расписания" onClick={() => nav.push({ name: 'import' })} />
          <Row icon="share" title="Календарь и резервная копия" onClick={() => nav.push({ name: 'export' })} />
          <Row icon="data" title="Хранение и демо-данные" onClick={() => nav.push({ name: 'data' })} />
        </List>
      </Section>

      <Section title="Настройки">
        <List>
          <Row icon="user" title="Профиль и оформление" onClick={() => nav.push({ name: 'settings' })} />
          <Row icon="bell" title="Напоминания" onClick={() => nav.push({ name: 'reminders' })} />
          <Row icon="phone" title="Установка на iPhone" value={isStandalone() ? 'Установлено' : undefined} onClick={() => nav.push({ name: 'install' })} />
          <Row icon="info" title="О приложении" onClick={() => nav.push({ name: 'about' })} />
        </List>
      </Section>

      <List>
        <Row icon="logout" title="Выйти из профиля" danger chevron={false} onClick={logout} />
      </List>
    </TabScreen>
  );
}
