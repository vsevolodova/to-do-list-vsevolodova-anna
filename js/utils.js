(function () {
  'use strict';

  const DAY_MS = 86400000;

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.floor(Math.random() * 16);
      const v = c === 'x' ? r : (r % 4) + 8;
      return v.toString(16);
    });
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toISODate(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function todayISO() {
    return toISODate(new Date());
  }

  function parseISODate(value) {
    if (!value || typeof value !== 'string') return null;
    const parts = value.split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) {
      return null;
    }
    return date;
  }

  function isValidISODate(value) {
    return parseISODate(value) !== null;
  }

  function addDaysISO(iso, days) {
    const date = parseISODate(iso);
    if (!date) return null;
    date.setDate(date.getDate() + days);
    return toISODate(date);
  }

  function endOfMonthISO(iso) {
    const date = parseISODate(iso);
    if (!date) return null;
    return toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  }

  function utcDayNumber(iso) {
    const date = parseISODate(iso);
    if (!date) return NaN;
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
  }

  function diffDays(fromISO, toISO) {
    return Math.round(utcDayNumber(toISO) - utcDayNumber(fromISO));
  }

  function plural(n, one, few, many) {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (last > 1 && last < 5) return few;
    if (last === 1) return one;
    return many;
  }

  function formatFullDate(iso) {
    const date = parseISODate(iso);
    if (!date) return '';
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  }

  function formatShortDate(iso) {
    const date = parseISODate(iso);
    if (!date) return '';
    const now = new Date();
    const options = { day: 'numeric', month: 'short' };
    if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
    return new Intl.DateTimeFormat('ru-RU', options).format(date).replace('.', '');
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  function formatDeadline(deadline, status) {
    if (!deadline) {
      return { label: 'Без срока', className: 'is-none', title: 'Срок не указан' };
    }

    const today = todayISO();
    const diff = diffDays(today, deadline);
    const isDone = status === 'done';

    if (!isDone && diff < 0) {
      const days = Math.abs(diff);
      return {
        label: 'Просрочено на ' + days + ' ' + plural(days, 'день', 'дня', 'дней'),
        className: 'is-overdue',
        title: formatFullDate(deadline)
      };
    }

    if (diff === 0) {
      return { label: 'Сегодня', className: 'is-today', title: formatFullDate(deadline) };
    }

    if (diff === 1) {
      return { label: 'Завтра', className: '', title: formatFullDate(deadline) };
    }

    return { label: formatShortDate(deadline), className: '', title: formatFullDate(deadline) };
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 Б';
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0).replace('.', ',') + ' КБ';
    return (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' МБ';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isImageAttachment(attachment) {
    if (!attachment) return false;
    if (attachment.type && attachment.type.indexOf('image/') === 0) return true;
    return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(attachment.name || '');
  }

  function fileKind(attachment) {
    const type = (attachment && attachment.type) || '';
    const name = (attachment && attachment.name) || '';
    if (type.indexOf('image/') === 0) return 'image';
    if (type.indexOf('pdf') !== -1) return 'file';
    if (type.indexOf('sheet') !== -1 || /\.(xlsx?|csv)$/i.test(name)) return 'file';
    if (type.indexOf('word') !== -1 || /\.(docx?|rtf)$/i.test(name)) return 'file';
    if (type.indexOf('zip') !== -1 || /\.(zip|rar|7z)$/i.test(name)) return 'file';
    return 'file';
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function isToday(iso) {
    return iso === todayISO();
  }

  function isPast(iso) {
    return !!iso && iso < todayISO();
  }

  function sundayOfCurrentWeek() {
    const now = new Date();
    const day = now.getDay();
    const daysUntilSunday = (7 - day) % 7;
    now.setDate(now.getDate() + daysUntilSunday);
    return toISODate(now);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  window.TodoUtils = {
    DAY_MS,
    uid,
    pad2,
    toISODate,
    todayISO,
    parseISODate,
    isValidISODate,
    addDaysISO,
    endOfMonthISO,
    diffDays,
    plural,
    formatFullDate,
    formatShortDate,
    formatDateTime,
    formatDeadline,
    formatFileSize,
    escapeHtml,
    isImageAttachment,
    fileKind,
    nowISO,
    isToday,
    isPast,
    sundayOfCurrentWeek,
    clamp
  };
})();
