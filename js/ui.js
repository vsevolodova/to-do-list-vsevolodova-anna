(function () {
  'use strict';

  const U = window.TodoUtils;

  const STATUS_LABELS = {
    new: 'Новая',
    in_progress: 'В работе',
    done: 'Готово'
  };

  const STATUS_ORDER = ['new', 'in_progress', 'done'];

  function escape(value) {
    return U.escapeHtml(value);
  }

  function icon(name, className) {
    return '<svg class="icon' + (className ? ' ' + className : '') + '" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || STATUS_LABELS.new;
  }

  function statusOptions(selected) {
    return STATUS_ORDER.map(function (status) {
      return '<option value="' + status + '"' + (status === selected ? ' selected' : '') + '>' + statusLabel(status) + '</option>';
    }).join('');
  }

  function statusSelect(task) {
    return '<select class="status-select status-' + task.status + '" data-action="change-status" aria-label="Статус задачи «' + escape(task.title) + '»">' +
      statusOptions(task.status) +
      '</select>';
  }

  function deadlineBadge(task) {
    const info = U.formatDeadline(task.deadline, task.status);
    return '<span class="deadline-badge ' + info.className + '" title="' + escape(info.title) + '">' +
      icon('calendar') + '<span>' + escape(info.label) + '</span>' +
      '</span>';
  }

  function taskCard(task) {
    const isDone = task.status === 'done';
    const title = task.title || 'Без названия';
    const description = task.description ? '<p class="task-desc">' + escape(task.description) + '</p>' : '';
    const resultFlag = task.result && task.result.trim()
      ? '<span class="meta-item result-flag" title="Результат заполнен">' + icon('check-circle') + '<span>Результат</span></span>'
      : '';
    const commentCount = Array.isArray(task.comments) ? task.comments.length : 0;
    const attachmentCount = Array.isArray(task.attachments) ? task.attachments.length : 0;

    return '<article class="task-card' + (isDone ? ' is-done' : '') + '" data-id="' + escape(task.id) + '">' +
      '<div class="task-controls">' +
        '<label class="task-check" title="' + (isDone ? 'Вернуть в работу' : 'Отметить выполненной') + '">' +
          '<input type="checkbox" data-action="toggle-done"' + (isDone ? ' checked' : '') + ' aria-label="' + escape((isDone ? 'Вернуть в работу задачу «' : 'Отметить выполненной задачу «') + title + '»') + '">' +
        '</label>' +
        '<button type="button" class="fire-btn' + (task.important ? ' active' : '') + '" data-action="toggle-important" aria-pressed="' + (!!task.important) + '" aria-label="' + (task.important ? 'Убрать важность' : 'Отметить важной') + '" title="' + (task.important ? 'Убрать важность' : 'Отметить важной') + '">' +
          icon('fire') +
        '</button>' +
      '</div>' +
      '<div class="task-content" data-action="open-task" role="button" tabindex="0">' +
        '<h3 class="task-title">' + escape(title) + '</h3>' +
        description +
        '<div class="task-meta">' +
          '<span class="meta-item" title="Комментарии">' + icon('comment') + '<span class="sr-only">Комментариев: </span><span>' + commentCount + '</span></span>' +
          '<span class="meta-item" title="Вложения">' + icon('paperclip') + '<span class="sr-only">Вложений: </span><span>' + attachmentCount + '</span></span>' +
          resultFlag +
        '</div>' +
      '</div>' +
      '<div class="task-side">' +
        statusSelect(task) +
        deadlineBadge(task) +
        '<div class="task-menu-wrap">' +
          '<button type="button" class="icon-btn menu-btn" data-action="toggle-menu" aria-haspopup="menu" aria-expanded="false" aria-label="Действия с задачей «' + escape(title) + '»">' +
            icon('dots') +
          '</button>' +
          '<div class="task-menu" role="menu" hidden>' +
            '<button type="button" role="menuitem" data-action="edit">' + icon('edit') + '<span>Редактировать</span></button>' +
            '<button type="button" role="menuitem" data-action="delete" class="danger">' + icon('trash') + '<span>Удалить</span></button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function emptyNoTasks() {
    return '<div class="empty-state accent">' +
      '<div class="empty-copy">' +
        '<span class="empty-icon" aria-hidden="true">' + icon('logo') + '</span>' +
        '<div><h2>Пока нет задач</h2><p>Добавьте первую задачу — и она появится в списке.</p></div>' +
      '</div>' +
      '<button type="button" class="btn btn-on-accent" data-action="create-task">' + icon('plus') + '<span>Создать задачу</span></button>' +
    '</div>';
  }

  function emptyFiltered() {
    return '<div class="empty-state">' +
      '<span class="empty-icon" aria-hidden="true">' + icon('filter') + '</span>' +
      '<h2>Ничего не найдено</h2>' +
      '<p>По выбранным фильтрам задач нет. Попробуйте изменить условия.</p>' +
      '<button type="button" class="btn btn-secondary" data-action="reset-filters">Сбросить фильтры</button>' +
    '</div>';
  }

  function filterChips(filters) {
    const chips = [];

    if (filters.status.size !== STATUS_ORDER.length) {
      const labels = STATUS_ORDER.filter(function (status) { return filters.status.has(status); })
        .map(statusLabel)
        .join(', ');
      chips.push({ group: 'status', label: 'Статус: ' + (labels || 'не выбран') });
    }

    if (filters.importance === 'important') {
      chips.push({ group: 'importance', label: 'Только важные' });
    }

    if (filters.deadline !== 'all') {
      const deadlines = {
        overdue: 'Просроченные',
        today: 'Сегодня',
        tomorrow: 'Завтра',
        week: 'На этой неделе',
        none: 'Без срока'
      };
      chips.push({ group: 'deadline', label: 'Срок: ' + (deadlines[filters.deadline] || filters.deadline) });
    }

    if (filters.attachments === 'with') {
      chips.push({ group: 'attachments', label: 'С файлами' });
    }

    if (!chips.length) return '';

    return '<span class="active-filters-label">Активные фильтры:</span>' +
      chips.map(function (chip) {
        return '<span class="filter-chip">' +
          '<span>' + escape(chip.label) + '</span>' +
          '<button type="button" data-reset-filter="' + chip.group + '" aria-label="Убрать фильтр «' + escape(chip.label) + '»">' + icon('close') + '</button>' +
          '</span>';
      }).join('');
  }

  function stat(value, label, className) {
    return '<span class="stat' + (className ? ' ' + className : '') + '"><strong>' + value + '</strong> <span>' + escape(label) + '</span></span>';
  }

  function stats(data) {
    return '<span class="stat shown"><span>Показано</span> <strong>' + data.shown + ' из ' + data.total + '</strong></span>' +
      stat(data.active, 'активных', '') +
      stat(data.overdue, 'просрочено', 'overdue') +
      stat(data.done, 'готово', 'done');
  }

  function commentItem(comment) {
    return '<li class="comment" data-comment-id="' + escape(comment.id) + '">' +
      '<div class="comment-bubble">' + escape(comment.text) + '</div>' +
      '<div class="comment-meta">' +
        '<time datetime="' + escape(comment.createdAt) + '">' + escape(U.formatDateTime(comment.createdAt)) + '</time>' +
        '<button type="button" data-action="delete-comment">Удалить</button>' +
      '</div>' +
    '</li>';
  }

  function attachmentRow(attachment, options) {
    const isDraft = !!(options && options.draft);
    const isImage = U.isImageAttachment(attachment);
    const thumbIcon = isImage ? 'image' : 'file';
    const badge = isDraft ? '<span class="badge-new">Новый</span>' : '';
    const name = attachment.name || 'Файл';

    return '<li class="attachment-row" data-attachment-id="' + escape(attachment.id) + '">' +
      '<div class="file-thumb" data-thumb-id="' + escape(attachment.id) + '" data-draft="' + (isDraft ? '1' : '0') + '">' + icon(thumbIcon) + '</div>' +
      '<div class="file-info">' +
        '<div class="file-name" title="' + escape(name) + '">' + escape(name) + badge + '</div>' +
        '<div class="file-sub" data-sub-id="' + escape(attachment.id) + '">' + escape(U.formatFileSize(attachment.size)) + '</div>' +
      '</div>' +
      '<div class="file-actions">' +
        '<button type="button" class="icon-btn" data-action="download-attachment" aria-label="Скачать файл «' + escape(name) + '»" title="Скачать">' + icon('download') + '</button>' +
        '<button type="button" class="icon-btn" data-action="remove-attachment" aria-label="Удалить файл «' + escape(name) + '»" title="Удалить">' + icon('trash') + '</button>' +
      '</div>' +
    '</li>';
  }

  function trashItem(task) {
    const deadline = U.formatDeadline(task.deadline, task.status);
    return '<li class="trash-item" data-id="' + escape(task.id) + '">' +
      '<div class="trash-main">' +
        '<div class="trash-title">' + escape(task.title || 'Без названия') + '</div>' +
        '<div class="trash-meta">Удалена ' + escape(U.formatDateTime(task.deletedAt)) +
          ' · ' + escape(statusLabel(task.status)) +
          ' · ' + escape(deadline.label) +
        '</div>' +
      '</div>' +
      '<div class="trash-actions">' +
        '<button type="button" class="btn btn-secondary btn-sm" data-action="restore-task">' + icon('restore') + '<span>Восстановить</span></button>' +
        '<button type="button" class="btn btn-danger-ghost btn-sm" data-action="purge-task">' + icon('trash') + '<span>Удалить навсегда</span></button>' +
      '</div>' +
    '</li>';
  }

  function emptyInline(text) {
    return '<li class="field-hint">' + escape(text) + '</li>';
  }

  window.TodoUI = {
    escape: escape,
    icon: icon,
    statusLabel: statusLabel,
    statusOptions: statusOptions,
    statusSelect: statusSelect,
    deadlineBadge: deadlineBadge,
    taskCard: taskCard,
    emptyNoTasks: emptyNoTasks,
    emptyFiltered: emptyFiltered,
    filterChips: filterChips,
    stat: stat,
    stats: stats,
    commentItem: commentItem,
    attachmentRow: attachmentRow,
    trashItem: trashItem,
    emptyInline: emptyInline
  };
})();
