/** Часовые пояса городов, где работают институты и филиалы РАНХиГС (для выбора при создании института). */
export const RUSSIAN_TIME_ZONES: { value: string; label: string }[] = [
  { value: 'Europe/Kaliningrad', label: 'Калининград (UTC+2)' },
  { value: 'Europe/Moscow', label: 'Москва (UTC+3)' },
  { value: 'Europe/Samara', label: 'Самара (UTC+4)' },
  { value: 'Asia/Yekaterinburg', label: 'Екатеринбург (UTC+5)' },
  { value: 'Asia/Omsk', label: 'Омск (UTC+6)' },
  { value: 'Asia/Novosibirsk', label: 'Новосибирск (UTC+7)' },
  { value: 'Asia/Krasnoyarsk', label: 'Красноярск (UTC+7)' },
  { value: 'Asia/Irkutsk', label: 'Иркутск (UTC+8)' },
  { value: 'Asia/Yakutsk', label: 'Якутск (UTC+9)' },
  { value: 'Asia/Vladivostok', label: 'Владивосток (UTC+10)' },
  { value: 'Asia/Magadan', label: 'Магадан (UTC+11)' },
  { value: 'Asia/Kamchatka', label: 'Петропавловск-Камчатский (UTC+12)' },
];

export const STUDY_FORM_LABELS = {
  full_time: 'Очная',
  part_time: 'Очно-заочная',
  extramural: 'Заочная',
} as const;

/** Подпись часового пояса для интерфейса: «Москва (UTC+3)» или идентификатор IANA. */
export function timeZoneLabel(timeZone: string): string {
  return RUSSIAN_TIME_ZONES.find((z) => z.value === timeZone)?.label ?? timeZone;
}
