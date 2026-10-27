/** Перечисления схемы данных (совпадают с типами PostgreSQL серверной версии приложения). */
export interface DbEnums {
  announcement_importance: 'normal' | 'important';
  assignment_status: 'not_started' | 'in_progress' | 'done' | 'submitted';
  attendance_status: 'present' | 'absent' | 'late' | 'excused';
  class_format: 'offline' | 'online' | 'hybrid';
  class_status: 'scheduled' | 'cancelled' | 'rescheduled';
  class_type: 'lecture' | 'seminar' | 'practice' | 'lab' | 'consultation' | 'other';
  data_source: 'official' | 'imported' | 'manual' | 'demo';
  event_kind: 'personal' | 'group' | 'university';
  exam_kind: 'exam' | 'credit' | 'graded_credit' | 'consultation' | 'retake' | 'defense';
  grade_kind: 'assignment' | 'test' | 'control' | 'colloquium' | 'credit' | 'exam' | 'coursework' | 'other';
  group_member_role: 'member' | 'moderator' | 'teacher';
  notification_kind:
    | 'class_soon'
    | 'schedule_change'
    | 'announcement'
    | 'assignment'
    | 'deadline'
    | 'payment'
    | 'exam'
    | 'grade'
    | 'personal_event'
    | 'system';
  priority_level: 'low' | 'medium' | 'high';
  schedule_change_type:
    | 'created'
    | 'updated'
    | 'cancelled'
    | 'restored'
    | 'rescheduled'
    | 'room_changed'
    | 'teacher_changed'
    | 'format_changed'
    | 'deleted';
  study_form: 'full_time' | 'part_time' | 'extramural';
  theme_preference: 'system' | 'light' | 'dark';
  user_role: 'student' | 'teacher' | 'admin';
}
export type Enums<K extends keyof DbEnums> = DbEnums[K];
