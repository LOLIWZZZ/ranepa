import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Регрессия: данные, сохранённые в localStorage, должны читаться при запуске приложения.
describe('загрузка сохранённых данных', () => {
  it('восстанавливает состояние из localStorage при старте', async () => {
    const saved = {
      version: 1,
      settings: { name: 'Анна', onboarded: true, timeZone: 'Asia/Novosibirsk' },
      subjects: [{ id: 's1', name: 'Право', short_name: null, color: '#3B5BDB', teacher: null, notes: null, source: 'manual', created_at: '2026-10-01T00:00:00Z' }],
      tasks: [{ id: 't1', title: 'Эссе', subject_id: 's1', description: null, due_at: null, priority: 'medium', status: 'not_started', completed_at: null, url: null, source: 'manual', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' }],
    };
    const store = new Map<string, string>([['ranepa-student:data:v1', JSON.stringify(saved)]]);
    (globalThis as unknown as { localStorage: Pick<Storage, 'getItem' | 'setItem'> }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const { getData } = await import('../src/store/store');
    const data = getData();
    assert.equal(data.settings.onboarded, true);
    assert.equal(data.settings.name, 'Анна');
    assert.equal(data.settings.timeZone, 'Asia/Novosibirsk');
    assert.equal(data.settings.classReminderMinutes, 15, 'недостающие настройки берутся по умолчанию');
    assert.equal(data.tasks.length, 1);
    assert.equal(data.subjects[0]?.name, 'Право');
  });
});
