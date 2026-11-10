(function () {
  'use strict';

  const U = window.TodoUtils;
  const S = window.TodoStorage;
  const UI = window.TodoUI;

  const MAX_FILES = 10;
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const PURGE_DAYS = 30;
  const ALL_STATUSES = ['new', 'in_progress', 'done'];

  const state = {
    tasks: [],
    settings: { requireResultForDone: false },
    ui: { sort: 'deadline_asc' },
    filters: {
      status: new Set(ALL_STATUSES),
      importance: 'all',
      deadline: 'all',
      attachments: 'all'
    },
    modal: null,
    storageAvailable: true
  };

  const els = {};
  let openMenuButton = null;
  let resultState = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    els.storageBanner = byId('storage-banner');
    els.storageBannerText = byId('storage-banner-text');
    els.trashBtn = byId('trash-btn');
    els.trashCount = byId('trash-count');
    els.settingsBtn = byId('settings-btn');
    els.sortSelect = byId('sort-select');
    els.filtersToggle = byId('filters-toggle');
    els.filtersCount = byId('filters-count');
    els.addTaskBtn = byId('add-task-btn');
    els.filtersPanel = byId('filters-panel');
    els.filterDeadline = byId('filter-deadline');
    els.resetFilters = byId('reset-filters');
    els.activeFilters = byId('active-filters');
    els.stats = byId('stats');
    els.taskList = byId('task-list');
    els.toasts = byId('toasts');

    els.taskDialog = byId('task-dialog');
    els.taskForm = byId('task-form');
    els.taskDialogTitle = byId('task-dialog-title');
    els.taskTitle = byId('task-title');
    els.titleError = byId('title-error');
    els.taskDescription = byId('task-description');
    els.taskDeadline = byId('task-deadline');
    els.deadlineHint = byId('deadline-hint');
    els.taskStatus = byId('task-status');
    els.taskImportant = byId('task-important');
    els.taskResult = byId('task-result');
    els.resultHint = byId('result-hint');
    els.resultError = byId('result-error');
    els.attachmentsCount = byId('attachments-count');
    els.dropzone = byId('dropzone');
    els.dropzoneText = byId('dropzone-text');
    els.fileInput = byId('file-input');
    els.attachmentList = byId('attachment-list');
    els.commentsList = byId('comments-list');
    els.commentsCount = byId('comments-count');
    els.commentText = byId('comment-text');
    els.addCommentBtn = byId('add-comment-btn');
    els.commentsCreateHint = byId('comments-create-hint');
    els.commentForm = document.querySelector('.comment-form');
    els.taskSaveBtn = byId('task-save-btn');
    els.taskDialogBody = els.taskDialog.querySelector('.modal-body');

    els.trashDialog = byId('trash-dialog');
    els.trashList = byId('trash-list');
    els.trashEmpty = byId('trash-empty');
    els.clearTrashBtn = byId('clear-trash-btn');

    els.settingsDialog = byId('settings-dialog');
    els.requireResultToggle = byId('require-result-toggle');

    els.resultDialog = byId('result-dialog');
    els.resultTaskTitle = byId('result-task-title');
    els.resultText = byId('result-text');
    els.resultDialogError = byId('result-dialog-error');
    els.resultSaveBtn = byId('result-save-btn');
  }

  function findTask(id) {
    for (let i = 0; i < state.tasks.length; i += 1) {
      if (state.tasks[i].id === id) return state.tasks[i];
    }
    return null;
  }

  function getNonDeletedTasks() {
    return state.tasks.filter(function (task) { return !task.deletedAt; });
  }

  function matchesFilters(task) {
    if (!state.filters.status.has(task.status)) return false;

    if (state.filters.importance === 'important' && !task.important) return false;

    const today = U.todayISO();
    const tomorrow = U.addDaysISO(today, 1);
    const sunday = U.sundayOfCurrentWeek();

    if (state.filters.deadline === 'overdue') {
      if (!task.deadline || task.status === 'done' || task.deadline >= today) return false;
    } else if (state.filters.deadline === 'today') {
      if (task.deadline !== today) return false;
    } else if (state.filters.deadline === 'tomorrow') {
      if (task.deadline !== tomorrow) return false;
    } else if (state.filters.deadline === 'week') {
      if (!task.deadline || task.deadline < today || task.deadline > sunday) return false;
    } else if (state.filters.deadline === 'none') {
      if (task.deadline) return false;
    }

    if (state.filters.attachments === 'with') {
      if (!Array.isArray(task.attachments) || task.attachments.length === 0) return false;
    }

    return true;
  }

  function compareDeadline(a, b, descending) {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    if (a.deadline === b.deadline) return 0;
    const result = a.deadline < b.deadline ? -1 : 1;
    return descending ? -result : result;
  }

  function compareCreated(a, b, descending) {
    const aValue = a.createdAt || '';
    const bValue = b.createdAt || '';
    if (aValue === bValue) return 0;
    const result = aValue < bValue ? -1 : 1;
    return descending ? -result : result;
  }

  function sortTasks(list) {
    const mode = state.ui.sort;
    const statusOrder = { new: 0, in_progress: 1, done: 2 };

    return list.sort(function (a, b) {
      if (mode !== 'status') {
        const aDone = a.status === 'done' ? 1 : 0;
        const bDone = b.status === 'done' ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
      }

      let compare = 0;

      if (mode === 'deadline_asc') {
        compare = compareDeadline(a, b, false);
      } else if (mode === 'deadline_desc') {
        compare = compareDeadline(a, b, true);
      } else if (mode === 'created_desc') {
        compare = compareCreated(a, b, true);
      } else if (mode === 'created_asc') {
        compare = compareCreated(a, b, false);
      } else if (mode === 'title_asc') {
        compare = (a.title || '').localeCompare(b.title || '', 'ru', { sensitivity: 'base' });
      } else if (mode === 'status') {
        compare = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
        if (compare === 0) compare = compareDeadline(a, b, false);
      } else if (mode === 'important') {
        if (!!a.important !== !!b.important) compare = a.important ? -1 : 1;
        else compare = compareDeadline(a, b, false);
      }

      if (compare !== 0) return compare;

      compare = compareCreated(a, b, true);
      if (compare !== 0) return compare;

      return (a.id || '').localeCompare(b.id || '');
    });
  }

  function getVisibleTasks() {
    return sortTasks(getNonDeletedTasks().filter(matchesFilters));
  }

  function focusTaskControl(taskId, selector) {
    const cards = els.taskList.querySelectorAll('.task-card');
    for (let i = 0; i < cards.length; i += 1) {
      if (cards[i].getAttribute('data-id') === taskId) {
        const target = cards[i].querySelector(selector);
        if (target) {
          target.focus();
          return true;
        }
        return false;
      }
    }
    return false;
  }

  function renderTasks(options) {
    const all = getNonDeletedTasks();
    const visible = getVisibleTasks();

    if (visible.length === 0) {
      els.taskList.innerHTML = all.length === 0 ? UI.emptyNoTasks() : UI.emptyFiltered();
    } else {
      els.taskList.innerHTML = visible.map(UI.taskCard).join('');
    }

    if (options && options.focusTaskId) {
      focusTaskControl(options.focusTaskId, options.focusSelector || '.task-content');
    }
  }

  function renderStats() {
    const all = getNonDeletedTasks();
    const today = U.todayISO();
    const activeTasks = all.filter(function (task) { return task.status !== 'done'; });
    const overdue = activeTasks.filter(function (task) {
      return !!task.deadline && task.deadline < today;
    }).length;

    els.stats.innerHTML = UI.stats({
      shown: getVisibleTasks().length,
      total: all.length,
      active: activeTasks.length,
      overdue: overdue,
      done: all.filter(function (task) { return task.status === 'done'; }).length
    });
  }

  function renderFilterChips() {
    const html = UI.filterChips(state.filters);
    els.activeFilters.innerHTML = html;
    els.activeFilters.hidden = !html;
  }

  function countActiveFilters() {
    let count = 0;
    if (state.filters.status.size !== ALL_STATUSES.length) count += 1;
    if (state.filters.importance === 'important') count += 1;
    if (state.filters.deadline !== 'all') count += 1;
    if (state.filters.attachments === 'with') count += 1;
    return count;
  }

  function renderFilterCount() {
    const count = countActiveFilters();
    els.filtersCount.textContent = String(count);
    els.filtersCount.hidden = count === 0;
  }

  function syncFilterPanel() {
    document.querySelectorAll('input[name="filter-status"]').forEach(function (input) {
      input.checked = state.filters.status.has(input.value);
    });
    document.querySelectorAll('input[name="filter-important"]').forEach(function (input) {
      input.checked = input.value === state.filters.importance;
    });
    document.querySelectorAll('input[name="filter-attachments"]').forEach(function (input) {
      input.checked = input.value === state.filters.attachments;
    });
    els.filterDeadline.value = state.filters.deadline;
  }

  function updateTrashCount() {
    const count = state.tasks.filter(function (task) { return !!task.deletedAt; }).length;
    els.trashCount.textContent = String(count);
    els.trashCount.hidden = count === 0;
    els.trashBtn.setAttribute('aria-label', count > 0 ? 'Корзина, задач: ' + count : 'Корзина');
  }

  function renderAll() {
    renderTasks();
    renderStats();
    renderFilterChips();
    renderFilterCount();
    updateTrashCount();
    if (els.trashDialog && els.trashDialog.open) renderTrash();
  }

  function showBanner(message) {
    if (!els.storageBanner) return;
    els.storageBannerText.textContent = message;
    els.storageBanner.hidden = false;
  }

  function showToast(message, options) {
    const config = options || {};
    const type = config.type === 'success' || config.type === 'error' ? config.type : 'info';
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;

    const iconWrap = document.createElement('span');
    iconWrap.className = 'toast-icon';
    iconWrap.innerHTML = UI.icon(type === 'success' ? 'check-circle' : type === 'error' ? 'alert' : 'comment');
    toast.appendChild(iconWrap);

    const text = document.createElement('div');
    text.className = 'toast-message';
    text.textContent = message;
    toast.appendChild(text);

    let timer = null;

    function dismiss() {
      if (timer) window.clearTimeout(timer);
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }

    if (config.actionLabel) {
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'toast-action';
      action.textContent = config.actionLabel;
      action.addEventListener('click', function () {
        dismiss();
        if (typeof config.onAction === 'function') config.onAction();
      });
      toast.appendChild(action);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Закрыть уведомление');
    close.innerHTML = UI.icon('close');
    close.addEventListener('click', dismiss);
    toast.appendChild(close);

    els.toasts.appendChild(toast);

    const duration = typeof config.duration === 'number' ? config.duration : 4500;
    if (duration > 0) {
      timer = window.setTimeout(dismiss, duration);
    }

    return dismiss;
  }

  function persistTasks() {
    return S.saveTasks(state.tasks);
  }

  function updateResultHint() {
    if (!els.resultHint) return;
    els.resultHint.textContent = state.settings.requireResultForDone
      ? 'Обязательно при переводе задачи в «Готово».'
      : 'Необязательно. Можно заполнить при завершении задачи.';
  }

  function completeTask(task, focusOptions) {
    const now = U.nowISO();
    task.status = 'done';
    task.completedAt = now;
    task.updatedAt = now;
    persistTasks();
    renderTasks(focusOptions);
    renderStats();
  }

  function handleToggleDone(taskId, checkbox) {
    const task = findTask(taskId);
    if (!task) return;

    if (task.status === 'done') {
      task.status = 'in_progress';
      task.completedAt = null;
      task.updatedAt = U.nowISO();
      persistTasks();
      renderTasks({ focusTaskId: taskId, focusSelector: '[data-action="toggle-done"]' });
      renderStats();
      return;
    }

    if (state.settings.requireResultForDone && !(task.result || '').trim()) {
      checkbox.checked = false;
      openResultDialog(task);
      return;
    }

    completeTask(task, { focusTaskId: taskId, focusSelector: '[data-action="toggle-done"]' });
  }

  function handleStatusChange(taskId, select) {
    const task = findTask(taskId);
    if (!task) return;

    const previousStatus = task.status;
    const nextStatus = select.value;
    if (nextStatus === previousStatus) return;

    if (nextStatus === 'done' && state.settings.requireResultForDone && !(task.result || '').trim()) {
      select.value = previousStatus;
      openResultDialog(task);
      return;
    }

    task.status = nextStatus;
    task.completedAt = nextStatus === 'done' ? U.nowISO() : null;
    task.updatedAt = U.nowISO();
    persistTasks();
    renderTasks({ focusTaskId: taskId, focusSelector: '[data-action="change-status"]' });
    renderStats();
  }

  function toggleImportant(taskId) {
    const task = findTask(taskId);
    if (!task) return;
    task.important = !task.important;
    task.updatedAt = U.nowISO();
    persistTasks();
    renderTasks({ focusTaskId: taskId, focusSelector: '[data-action="toggle-important"]' });
    renderStats();
  }

  function softDeleteTask(taskId) {
    const task = findTask(taskId);
    if (!task || task.deletedAt) return;

    task.deletedAt = U.nowISO();
    task.updatedAt = task.deletedAt;
    persistTasks();
    renderAll();

    showToast('Задача удалена', {
      type: 'info',
      actionLabel: 'Отменить',
      duration: 5000,
      onAction: function () {
        restoreTask(taskId, false);
      }
    });
  }

  function restoreTask(taskId, silent) {
    const task = findTask(taskId);
    if (!task) {
      if (!silent) showToast('Задача уже удалена навсегда', { type: 'error' });
      return false;
    }

    if (!task.deletedAt) {
      if (!silent) showToast('Задача уже восстановлена', { type: 'info' });
      return false;
    }

    task.deletedAt = null;
    task.updatedAt = U.nowISO();
    persistTasks();
    renderAll();

    if (!silent) showToast('Задача восстановлена', { type: 'success' });
    return true;
  }

  function getFormSnapshot() {
    if (!state.modal) return '';
    return JSON.stringify({
      title: els.taskTitle.value,
      description: els.taskDescription.value,
      deadline: els.taskDeadline.value,
      status: els.taskStatus.value,
      important: els.taskImportant.checked,
      result: els.taskResult.value,
      draftCount: state.modal.draftFiles.length,
      removedCount: state.modal.removed.size
    });
  }

  function isFormDirty() {
    return !!state.modal && state.modal.initial !== getFormSnapshot();
  }

  function setFieldError(input, errorElement, visible) {
    if (errorElement) errorElement.hidden = !visible;
    if (input) {
      input.classList.toggle('is-invalid', visible);
      input.setAttribute('aria-invalid', visible ? 'true' : 'false');
      if (visible) input.focus();
    }
  }

  function hideFieldError(input, errorElement) {
    if (errorElement) errorElement.hidden = true;
    if (input) {
      input.classList.remove('is-invalid');
      input.setAttribute('aria-invalid', 'false');
    }
  }

  function openTaskModal(taskId) {
    const task = taskId ? findTask(taskId) : null;
    if (taskId && !task) return;
    if (els.taskDialog.open) return;

    state.modal = {
      mode: task ? 'edit' : 'create',
      taskId: task ? task.id : null,
      initialStatus: task ? task.status : null,
      draftFiles: [],
      removed: new Set(),
      initial: '',
      thumbUrls: [],
      thumbToken: 0,
      saving: false
    };

    const isEdit = !!task;

    els.taskDialogTitle.textContent = isEdit ? 'Редактирование задачи' : 'Новая задача';
    els.taskSaveBtn.textContent = isEdit ? 'Сохранить' : 'Создать';
    els.taskSaveBtn.disabled = false;

    els.taskTitle.value = task ? task.title : '';
    els.taskDescription.value = task ? task.description : '';
    els.taskDeadline.value = task ? (task.deadline || '') : U.todayISO();
    els.taskStatus.value = task ? task.status : 'new';
    els.taskImportant.checked = !!(task && task.important);
    els.taskResult.value = task ? task.result : '';
    els.commentText.value = '';
    els.addCommentBtn.disabled = true;

    hideFieldError(els.taskTitle, els.titleError);
    hideFieldError(els.taskResult, els.resultError);

    els.commentsList.hidden = !isEdit;
    els.commentForm.hidden = !isEdit;
    els.commentsCreateHint.hidden = isEdit;
    els.commentsCount.textContent = '';
    els.commentsList.innerHTML = '';

    if (isEdit) renderComments();

    updateDeadlineUI();
    updateResultHint();
    renderAttachments();
    els.taskDialogBody.scrollTop = 0;
    state.modal.initial = getFormSnapshot();

    els.taskDialog.showModal();
    window.setTimeout(function () { els.taskTitle.focus(); }, 0);
  }

  function closeTaskDialog() {
    if (els.taskDialog.open) {
      els.taskDialog.close();
    } else {
      state.modal = null;
    }
  }

  function requestCloseTaskDialog() {
    if (!state.modal || state.modal.saving) return;
    if (isFormDirty() && !window.confirm('Закрыть задачу без сохранения? Внесённые изменения будут потеряны.')) {
      return;
    }
    closeTaskDialog();
  }

  function renderComments() {
    if (!state.modal || state.modal.mode !== 'edit') return;
    const task = findTask(state.modal.taskId);
    if (!task) return;

    els.commentsList.innerHTML = task.comments.length
      ? task.comments.map(UI.commentItem).join('')
      : UI.emptyInline('Комментариев пока нет.');
    els.commentsCount.textContent = task.comments.length ? String(task.comments.length) : '';
  }

  function addComment() {
    if (!state.modal || state.modal.mode !== 'edit') return;
    const task = findTask(state.modal.taskId);
    if (!task) return;

    const text = els.commentText.value.trim();
    if (!text) return;

    task.comments.push({ id: U.uid(), text: text, createdAt: U.nowISO() });
    task.updatedAt = U.nowISO();
    persistTasks();

    els.commentText.value = '';
    els.addCommentBtn.disabled = true;
    renderComments();
    renderTasks();
    els.commentText.focus();
  }

  function deleteComment(commentId) {
    if (!state.modal || state.modal.mode !== 'edit') return;
    const task = findTask(state.modal.taskId);
    if (!task) return;

    const index = task.comments.findIndex(function (comment) { return comment.id === commentId; });
    if (index === -1) return;

    if (!window.confirm('Удалить комментарий?')) return;

    task.comments.splice(index, 1);
    task.updatedAt = U.nowISO();
    persistTasks();
    renderComments();
    renderTasks();
  }

  function getModalTask() {
    return state.modal && state.modal.taskId ? findTask(state.modal.taskId) : null;
  }

  function getKeptAttachments() {
    if (!state.modal) return [];
    const task = getModalTask();
    if (!task) return [];
    return task.attachments.filter(function (attachment) {
      return !state.modal.removed.has(attachment.id);
    });
  }

  function getModalAttachmentCount() {
    if (!state.modal) return 0;
    return getKeptAttachments().length + state.modal.draftFiles.length;
  }

  function clearThumbUrls() {
    if (!state.modal) return;
    state.modal.thumbUrls.forEach(function (url) {
      try { URL.revokeObjectURL(url); } catch (error) { /* no-op */ }
    });
    state.modal.thumbUrls = [];
  }

  function findThumbElement(id) {
    const boxes = els.attachmentList.querySelectorAll('[data-thumb-id]');
    for (let i = 0; i < boxes.length; i += 1) {
      if (boxes[i].getAttribute('data-thumb-id') === id) return boxes[i];
    }
    return null;
  }

  function findFileSubElement(id) {
    const elements = els.attachmentList.querySelectorAll('[data-sub-id]');
    for (let i = 0; i < elements.length; i += 1) {
      if (elements[i].getAttribute('data-sub-id') === id) return elements[i];
    }
    return null;
  }

  function setThumb(id, url) {
    const box = findThumbElement(id);
    if (!box) return;
    box.innerHTML = '';
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.src = url;
    box.appendChild(image);
  }

  function markFileMissing(id) {
    const sub = findFileSubElement(id);
    if (!sub) return;
    sub.textContent = 'Файл недоступен';
    sub.classList.add('is-missing');
  }

  function hydrateAttachmentThumbs(token, kept, drafts) {
    drafts.forEach(function (draft) {
      if (!U.isImageAttachment(draft)) return;
      const url = URL.createObjectURL(draft.file);
      if (!state.modal || state.modal.thumbToken !== token) {
        URL.revokeObjectURL(url);
        return;
      }
      state.modal.thumbUrls.push(url);
      setThumb(draft.id, url);
    });

    kept.filter(U.isImageAttachment).forEach(function (attachment) {
      S.getFile(attachment.id).then(function (record) {
        if (!state.modal || state.modal.thumbToken !== token) return;
        if (!record || !record.blob) {
          markFileMissing(attachment.id);
          return;
        }
        const url = URL.createObjectURL(record.blob);
        if (!state.modal || state.modal.thumbToken !== token) {
          URL.revokeObjectURL(url);
          return;
        }
        state.modal.thumbUrls.push(url);
        setThumb(attachment.id, url);
      }).catch(function () {
        if (state.modal && state.modal.thumbToken === token) markFileMissing(attachment.id);
      });
    });

    kept.filter(function (attachment) { return !U.isImageAttachment(attachment); }).forEach(function (attachment) {
      S.hasFile(attachment.id).then(function (exists) {
        if (!state.modal || state.modal.thumbToken !== token) return;
        if (!exists) markFileMissing(attachment.id);
      }).catch(function () {
        if (state.modal && state.modal.thumbToken === token) markFileMissing(attachment.id);
      });
    });
  }

  function updateAttachmentCount() {
    if (!state.modal) return;
    const count = getModalAttachmentCount();
    els.attachmentsCount.textContent = count + ' / ' + MAX_FILES;

    const full = count >= MAX_FILES;
    els.dropzone.disabled = full;
    els.fileInput.disabled = full;
    els.dropzoneText.textContent = full
      ? 'Достигнут лимит — 10 файлов'
      : 'Перетащите файлы сюда или нажмите, чтобы выбрать';
  }

  function renderAttachments() {
    if (!state.modal) return;

    state.modal.thumbToken += 1;
    const token = state.modal.thumbToken;
    clearThumbUrls();

    const kept = getKeptAttachments();
    const drafts = state.modal.draftFiles.slice();
    const rows = kept.map(function (attachment) {
      return UI.attachmentRow(attachment, { draft: false });
    }).concat(drafts.map(function (draft) {
      return UI.attachmentRow(draft, { draft: true });
    }));

    els.attachmentList.innerHTML = rows.length
      ? rows.join('')
      : UI.emptyInline('Файлов пока нет.');

    updateAttachmentCount();
    hydrateAttachmentThumbs(token, kept, drafts);
  }

  function addFiles(fileList) {
    if (!state.modal) return;
    if (!S.indexedDBSupported()) {
      showToast('Браузер не поддерживает хранение файлов.', { type: 'error' });
      return;
    }

    const files = Array.prototype.slice.call(fileList || []);
    let count = getModalAttachmentCount();
    let added = 0;

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      if (count >= MAX_FILES) {
        showToast('Можно прикрепить не более 10 файлов.', { type: 'error' });
        break;
      }
      if (file.size > MAX_FILE_SIZE) {
        showToast('Файл «' + file.name + '» больше 10 МБ.', { type: 'error' });
        continue;
      }
      state.modal.draftFiles.push({
        id: U.uid(),
        file: file,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        createdAt: U.nowISO()
      });
      count += 1;
      added += 1;
    }

    if (added > 0) renderAttachments();
  }

  function removeAttachment(attachmentId) {
    if (!state.modal) return;
    const draftIndex = state.modal.draftFiles.findIndex(function (draft) { return draft.id === attachmentId; });
    const task = getModalTask();
    const existing = task ? task.attachments.find(function (attachment) { return attachment.id === attachmentId; }) : null;
    const name = draftIndex !== -1
      ? state.modal.draftFiles[draftIndex].name
      : existing ? existing.name : 'файл';

    if (draftIndex === -1 && !existing) return;
    if (!window.confirm('Удалить файл «' + name + '»?')) return;

    if (draftIndex !== -1) {
      state.modal.draftFiles.splice(draftIndex, 1);
    } else {
      state.modal.removed.add(attachmentId);
    }

    renderAttachments();
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name || 'file';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function downloadAttachment(attachmentId) {
    if (!state.modal) return;
    const draft = state.modal.draftFiles.find(function (item) { return item.id === attachmentId; });
    if (draft) {
      downloadBlob(draft.file, draft.name);
      return;
    }

    S.getFile(attachmentId).then(function (record) {
      if (!record || !record.blob) {
        showToast('Файл недоступен', { type: 'error' });
        return;
      }
      downloadBlob(record.blob, record.name || 'file');
    }).catch(function () {
      showToast('Не удалось прочитать файл', { type: 'error' });
    });
  }

  function updateDeadlineUI() {
    const value = els.taskDeadline.value;
    const today = U.todayISO();
    const tomorrow = U.addDaysISO(today, 1);
    const endOfMonth = U.endOfMonthISO(today);

    let activePreset = null;
    if (!value) activePreset = 'none';
    else if (value === today) activePreset = 'today';
    else if (value === tomorrow) activePreset = 'tomorrow';
    else if (value === endOfMonth) activePreset = 'month_end';

    document.querySelectorAll('.preset').forEach(function (button) {
      button.classList.toggle('is-active', button.getAttribute('data-preset') === activePreset);
    });

    let hint = '';
    let warning = false;
    if (!value) {
      hint = 'Задача будет без срока.';
    } else if (value < today) {
      hint = 'Срок уже прошёл — задача будет просроченной.';
      warning = true;
    } else if (value === today) {
      hint = 'Срок — сегодня.';
    } else if (value === tomorrow) {
      hint = 'Срок — завтра.';
    } else {
      const formattedDate = U.formatFullDate(value);
      hint = 'Срок — ' + formattedDate + (formattedDate.slice(-1) === '.' ? '' : '.');
    }

    els.deadlineHint.textContent = hint;
    els.deadlineHint.classList.toggle('is-warning', warning);
  }

  async function onTaskFormSubmit(event) {
    event.preventDefault();
    if (!state.modal || state.modal.saving) return;

    const title = els.taskTitle.value.trim();
    const status = els.taskStatus.value;
    const result = els.taskResult.value.trim();
    let valid = true;

    if (!title) {
      setFieldError(els.taskTitle, els.titleError, true);
      valid = false;
    } else {
      hideFieldError(els.taskTitle, els.titleError);
    }

    const alreadyDone = state.modal.mode === 'edit' && state.modal.initialStatus === 'done';
    if (status === 'done' && state.settings.requireResultForDone && !result && !alreadyDone) {
      setFieldError(els.taskResult, els.resultError, true);
      valid = false;
    } else {
      hideFieldError(els.taskResult, els.resultError);
    }

    if (!valid) return;

    const modal = state.modal;
    modal.saving = true;
    els.taskSaveBtn.disabled = true;
    const previousLabel = els.taskSaveBtn.textContent;
    els.taskSaveBtn.textContent = 'Сохранение…';

    try {
      const existing = modal.taskId ? findTask(modal.taskId) : null;
      const previousStatus = existing ? existing.status : null;
      const task = existing || {
        id: U.uid(),
        title: '',
        description: '',
        deadline: null,
        status: 'new',
        result: '',
        important: false,
        comments: [],
        attachments: [],
        createdAt: U.nowISO(),
        updatedAt: U.nowISO(),
        completedAt: null,
        deletedAt: null
      };

      const kept = existing
        ? existing.attachments.filter(function (attachment) { return !modal.removed.has(attachment.id); })
        : [];
      const newMeta = [];
      const failedFiles = [];

      for (let i = 0; i < modal.draftFiles.length; i += 1) {
        const draft = modal.draftFiles[i];
        try {
          await S.saveFile({
            id: draft.id,
            taskId: task.id,
            name: draft.name,
            type: draft.type,
            size: draft.size,
            blob: draft.file,
            createdAt: draft.createdAt
          });
          newMeta.push({
            id: draft.id,
            name: draft.name,
            type: draft.type,
            size: draft.size,
            createdAt: draft.createdAt
          });
        } catch (error) {
          failedFiles.push(draft.name);
        }
      }

      task.title = title;
      task.description = els.taskDescription.value.trim();
      task.deadline = els.taskDeadline.value || null;
      task.status = status;
      task.important = els.taskImportant.checked;
      task.result = result;
      task.attachments = kept.concat(newMeta);
      task.updatedAt = U.nowISO();

      if (status === 'done') {
        if (previousStatus !== 'done') task.completedAt = task.updatedAt;
      } else {
        task.completedAt = null;
      }

      if (!existing) state.tasks.push(task);

      const persisted = persistTasks();
      if (persisted && modal.removed.size > 0) {
        await Promise.allSettled(Array.from(modal.removed).map(function (id) {
          return S.deleteFile(id);
        }));
      }

      const wasEdit = !!existing;
      renderAll();
      els.taskDialog.close();
      if (!(wasEdit && focusTaskControl(task.id, '.task-content'))) {
        els.addTaskBtn.focus();
      }

      if (failedFiles.length > 0) {
        showToast('Не удалось сохранить файлы: ' + failedFiles.join(', '), { type: 'error', duration: 7000 });
      }

      if (persisted) {
        showToast(wasEdit ? 'Изменения сохранены' : 'Задача создана', { type: 'success' });
      } else {
        showToast('Не удалось сохранить изменения в браузере.', { type: 'error', duration: 7000 });
      }
    } catch (error) {
      showToast('Не удалось сохранить задачу. Попробуйте ещё раз.', { type: 'error', duration: 7000 });
    } finally {
      if (state.modal) state.modal.saving = false;
      if (els.taskSaveBtn) {
        els.taskSaveBtn.disabled = false;
        els.taskSaveBtn.textContent = previousLabel;
      }
    }
  }


  async function purgeOldDeleted() {
    const cutoff = Date.now() - PURGE_DAYS * 86400000;
    const oldTasks = state.tasks.filter(function (task) {
      if (!task.deletedAt) return false;
      const deletedTime = new Date(task.deletedAt).getTime();
      return Number.isFinite(deletedTime) && deletedTime < cutoff;
    });

    if (oldTasks.length === 0) return 0;

    await Promise.allSettled(oldTasks.map(function (task) {
      return S.deleteFilesByTask(task.id);
    }));

    const ids = new Set(oldTasks.map(function (task) { return task.id; }));
    state.tasks = state.tasks.filter(function (task) { return !ids.has(task.id); });
    persistTasks();
    return oldTasks.length;
  }

  function renderTrash() {
    const deleted = state.tasks.filter(function (task) { return !!task.deletedAt; })
      .sort(function (a, b) { return (b.deletedAt || '').localeCompare(a.deletedAt || ''); });

    els.trashList.innerHTML = deleted.map(UI.trashItem).join('');
    els.trashEmpty.hidden = deleted.length > 0;
    els.clearTrashBtn.disabled = deleted.length === 0;
  }

  function openTrash() {
    renderTrash();
    updateTrashCount();
    if (!els.trashDialog.open) els.trashDialog.showModal();
  }

  async function permanentlyDeleteTask(taskId) {
    const task = findTask(taskId);
    if (!task || !task.deletedAt) return;

    if (!window.confirm('Удалить задачу «' + task.title + '» навсегда? Это действие нельзя отменить.')) return;

    await Promise.allSettled([S.deleteFilesByTask(taskId)]);
    state.tasks = state.tasks.filter(function (item) { return item.id !== taskId; });
    persistTasks();
    renderAll();
    renderTrash();
    showToast('Задача удалена навсегда', { type: 'info' });
  }

  async function clearTrash() {
    const deleted = state.tasks.filter(function (task) { return !!task.deletedAt; });
    if (deleted.length === 0) return;

    if (!window.confirm('Очистить корзину? Все удалённые задачи будут удалены безвозвратно.')) return;

    await Promise.allSettled(deleted.map(function (task) {
      return S.deleteFilesByTask(task.id);
    }));

    state.tasks = state.tasks.filter(function (task) { return !task.deletedAt; });
    persistTasks();
    renderAll();
    renderTrash();
    showToast('Корзина очищена', { type: 'info' });
  }

  function openResultDialog(task) {
    resultState = { taskId: task.id };
    els.resultTaskTitle.textContent = task.title || 'Без названия';
    els.resultText.value = '';
    els.resultDialogError.hidden = true;
    els.resultText.classList.remove('is-invalid');
    if (!els.resultDialog.open) els.resultDialog.showModal();
    window.setTimeout(function () { els.resultText.focus(); }, 0);
  }

  function saveResult() {
    if (!resultState) return;

    const text = els.resultText.value.trim();
    if (!text) {
      els.resultDialogError.hidden = false;
      els.resultText.classList.add('is-invalid');
      els.resultText.focus();
      return;
    }

    const task = findTask(resultState.taskId);
    if (!task) {
      els.resultDialog.close();
      return;
    }

    task.result = text;
    task.status = 'done';
    task.completedAt = U.nowISO();
    task.updatedAt = task.completedAt;
    persistTasks();
    renderAll();
    els.resultDialog.close();
    if (!focusTaskControl(task.id, '.task-content')) els.addTaskBtn.focus();
    showToast('Задача завершена', { type: 'success' });
  }

  function openSettings() {
    els.requireResultToggle.checked = !!state.settings.requireResultForDone;
    if (!els.settingsDialog.open) els.settingsDialog.showModal();
  }

  function onRequireResultChange() {
    state.settings.requireResultForDone = els.requireResultToggle.checked;
    S.saveSettings(state.settings);
    updateResultHint();
  }

  function closeAllMenus(focusButton) {
    const menus = document.querySelectorAll('.task-menu:not([hidden])');
    menus.forEach(function (menu) {
      menu.hidden = true;
      const wrap = menu.parentElement;
      const button = wrap ? wrap.querySelector('[data-action="toggle-menu"]') : null;
      if (button) button.setAttribute('aria-expanded', 'false');
    });
    if (focusButton && openMenuButton) openMenuButton.focus();
    openMenuButton = null;
  }

  function toggleMenu(button) {
    const wrap = button.parentElement;
    const menu = wrap ? wrap.querySelector('.task-menu') : null;
    if (!menu) return;

    const willOpen = menu.hidden;
    closeAllMenus(false);

    if (willOpen) {
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      openMenuButton = button;
      const firstItem = menu.querySelector('button');
      if (firstItem) firstItem.focus();
    }
  }

  function onTaskListClick(event) {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;

    const action = actionElement.getAttribute('data-action');

    if (action === 'create-task') {
      openTaskModal(null);
      return;
    }

    if (action === 'reset-filters') {
      resetFilters();
      return;
    }

    const card = actionElement.closest('.task-card');
    if (!card) return;
    const taskId = card.getAttribute('data-id');

    if (action === 'toggle-menu') {
      event.stopPropagation();
      toggleMenu(actionElement);
    } else if (action === 'open-task' || action === 'edit') {
      closeAllMenus(false);
      openTaskModal(taskId);
    } else if (action === 'delete') {
      closeAllMenus(false);
      softDeleteTask(taskId);
    } else if (action === 'toggle-important') {
      toggleImportant(taskId);
    }
  }

  function onTaskListChange(event) {
    const target = event.target;
    const card = target.closest('.task-card');
    if (!card) return;
    const taskId = card.getAttribute('data-id');

    if (target.matches('[data-action="toggle-done"]')) {
      handleToggleDone(taskId, target);
    } else if (target.matches('[data-action="change-status"]')) {
      handleStatusChange(taskId, target);
    }
  }

  function onTaskListKeydown(event) {
    const menuButton = event.target.closest('[data-action="toggle-menu"]');
    if (menuButton && event.key === 'ArrowDown') {
      event.preventDefault();
      toggleMenu(menuButton);
      return;
    }

    const content = event.target.closest('.task-content');
    if (content && (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar')) {
      event.preventDefault();
      const card = content.closest('.task-card');
      if (card) openTaskModal(card.getAttribute('data-id'));
    }
  }

  function onDocumentKeydown(event) {
    if (event.key === 'Escape') {
      if (document.querySelector('dialog[open]')) return;
      const openMenus = document.querySelectorAll('.task-menu:not([hidden])');
      if (openMenus.length > 0) {
        closeAllMenus(true);
        return;
      }
      if (!els.filtersPanel.hidden) {
        els.filtersPanel.hidden = true;
        els.filtersToggle.setAttribute('aria-expanded', 'false');
        els.filtersToggle.focus();
        return;
      }
    }

    const menu = event.target.closest('.task-menu');
    if (menu && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End')) {
      const items = Array.prototype.slice.call(menu.querySelectorAll('button'));
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement);
      let next = current;

      if (event.key === 'ArrowDown') next = (current + 1) % items.length;
      else if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = items.length - 1;

      event.preventDefault();
      items[next].focus();
    }
  }

  function onDocumentClick(event) {
    const closeButton = event.target.closest('[data-close-dialog]');
    if (closeButton) {
      const dialog = byId(closeButton.getAttribute('data-close-dialog'));
      if (dialog) {
        if (dialog === els.taskDialog) requestCloseTaskDialog();
        else if (dialog.open) dialog.close();
      }
    }

    if (!event.target.closest('.task-menu-wrap')) closeAllMenus(false);
  }

  function resetFilters() {
    state.filters.status = new Set(ALL_STATUSES);
    state.filters.importance = 'all';
    state.filters.deadline = 'all';
    state.filters.attachments = 'all';
    syncFilterPanel();
    renderTasks();
    renderStats();
    renderFilterChips();
    renderFilterCount();
  }

  function resetSingleFilter(group) {
    if (group === 'status') state.filters.status = new Set(ALL_STATUSES);
    else if (group === 'importance') state.filters.importance = 'all';
    else if (group === 'deadline') state.filters.deadline = 'all';
    else if (group === 'attachments') state.filters.attachments = 'all';
    else return;

    syncFilterPanel();
    renderTasks();
    renderStats();
    renderFilterChips();
    renderFilterCount();
  }

  function onActiveFiltersClick(event) {
    const button = event.target.closest('[data-reset-filter]');
    if (!button) return;
    resetSingleFilter(button.getAttribute('data-reset-filter'));
  }

  function onFiltersChange(event) {
    const target = event.target;

    if (target.name === 'filter-status') {
      const checked = document.querySelectorAll('input[name="filter-status"]:checked');
      state.filters.status = new Set(Array.prototype.map.call(checked, function (input) { return input.value; }));
    } else if (target.name === 'filter-important' && target.checked) {
      state.filters.importance = target.value;
    } else if (target.name === 'filter-attachments' && target.checked) {
      state.filters.attachments = target.value;
    } else if (target.id === 'filter-deadline') {
      state.filters.deadline = target.value;
    } else {
      return;
    }

    renderTasks();
    renderStats();
    renderFilterChips();
    renderFilterCount();
  }

  function toggleFiltersPanel() {
    const willOpen = els.filtersPanel.hidden;
    els.filtersPanel.hidden = !willOpen;
    els.filtersToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');

    if (willOpen) {
      const first = els.filtersPanel.querySelector('input, select, button');
      if (first) first.focus();
    }
  }

  function onSortChange() {
    state.ui.sort = els.sortSelect.value;
    S.saveUI(state.ui);
    renderTasks();
    renderStats();
  }

  function onTrashListClick(event) {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;
    const item = actionElement.closest('.trash-item');
    if (!item) return;

    const taskId = item.getAttribute('data-id');
    const action = actionElement.getAttribute('data-action');

    if (action === 'restore-task') restoreTask(taskId, false);
    else if (action === 'purge-task') permanentlyDeleteTask(taskId);
  }

  function onAttachmentListClick(event) {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;
    const row = actionElement.closest('.attachment-row');
    if (!row) return;

    const attachmentId = row.getAttribute('data-attachment-id');
    const action = actionElement.getAttribute('data-action');

    if (action === 'download-attachment') downloadAttachment(attachmentId);
    else if (action === 'remove-attachment') removeAttachment(attachmentId);
  }

  function onCommentsListClick(event) {
    const button = event.target.closest('[data-action="delete-comment"]');
    if (!button) return;
    const item = button.closest('.comment');
    if (item) deleteComment(item.getAttribute('data-comment-id'));
  }

  function bindEvents() {
    els.addTaskBtn.addEventListener('click', function () { openTaskModal(null); });
    els.trashBtn.addEventListener('click', openTrash);
    els.settingsBtn.addEventListener('click', openSettings);
    els.filtersToggle.addEventListener('click', toggleFiltersPanel);
    els.resetFilters.addEventListener('click', resetFilters);
    els.sortSelect.addEventListener('change', onSortChange);
    els.filtersPanel.addEventListener('change', onFiltersChange);
    els.activeFilters.addEventListener('click', onActiveFiltersClick);

    els.taskList.addEventListener('click', onTaskListClick);
    els.taskList.addEventListener('change', onTaskListChange);
    els.taskList.addEventListener('keydown', onTaskListKeydown);

    els.taskForm.addEventListener('submit', onTaskFormSubmit);
    els.taskTitle.addEventListener('input', function () { hideFieldError(els.taskTitle, els.titleError); });
    els.taskResult.addEventListener('input', function () { hideFieldError(els.taskResult, els.resultError); });
    els.taskStatus.addEventListener('change', function () {
      if (els.taskStatus.value !== 'done') hideFieldError(els.taskResult, els.resultError);
    });
    els.taskDeadline.addEventListener('change', updateDeadlineUI);

    document.querySelectorAll('.preset').forEach(function (button) {
      button.addEventListener('click', function () {
        const preset = button.getAttribute('data-preset');
        if (preset === 'today') els.taskDeadline.value = U.todayISO();
        else if (preset === 'tomorrow') els.taskDeadline.value = U.addDaysISO(U.todayISO(), 1);
        else if (preset === 'month_end') els.taskDeadline.value = U.endOfMonthISO(U.todayISO());
        else els.taskDeadline.value = '';
        updateDeadlineUI();
      });
    });

    els.dropzone.addEventListener('click', function () {
      if (!els.dropzone.disabled) els.fileInput.click();
    });
    els.fileInput.addEventListener('change', function () {
      addFiles(els.fileInput.files);
      els.fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (type) {
      els.dropzone.addEventListener(type, function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (!els.dropzone.disabled) els.dropzone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'drop'].forEach(function (type) {
      els.dropzone.addEventListener(type, function (event) {
        event.preventDefault();
        event.stopPropagation();
        els.dropzone.classList.remove('is-dragover');
      });
    });

    els.dropzone.addEventListener('drop', function (event) {
      addFiles(event.dataTransfer.files);
    });

    els.attachmentList.addEventListener('click', onAttachmentListClick);

    els.commentText.addEventListener('input', function () {
      els.addCommentBtn.disabled = !els.commentText.value.trim();
    });
    els.commentText.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (!els.addCommentBtn.disabled) addComment();
      }
    });
    els.addCommentBtn.addEventListener('click', addComment);
    els.commentsList.addEventListener('click', onCommentsListClick);

    els.taskDialog.addEventListener('cancel', function (event) {
      event.preventDefault();
      requestCloseTaskDialog();
    });
    els.taskDialog.addEventListener('close', function () {
      clearThumbUrls();
      state.modal = null;
    });

    [els.taskDialog, els.trashDialog, els.settingsDialog, els.resultDialog].forEach(function (dialog) {
      dialog.addEventListener('click', function (event) {
        if (event.target !== dialog) return;
        if (dialog === els.taskDialog) requestCloseTaskDialog();
        else dialog.close();
      });
    });

    els.trashList.addEventListener('click', onTrashListClick);
    els.clearTrashBtn.addEventListener('click', clearTrash);
    els.requireResultToggle.addEventListener('change', onRequireResultChange);

    els.resultSaveBtn.addEventListener('click', saveResult);
    els.resultText.addEventListener('input', function () {
      els.resultDialogError.hidden = true;
      els.resultText.classList.remove('is-invalid');
    });
    els.resultDialog.addEventListener('close', function () {
      resultState = null;
      els.resultDialogError.hidden = true;
      els.resultText.classList.remove('is-invalid');
    });

    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onDocumentKeydown);

    window.addEventListener('todo:storage-error', function (event) {
      if (event.detail && event.detail.message) showBanner(event.detail.message);
    });
  }

  function init() {
    cacheElements();
    bindEvents();

    const initData = S.init();
    state.tasks = initData.tasks;
    state.settings = initData.settings;
    state.ui = initData.ui;
    state.storageAvailable = initData.available;

    els.sortSelect.value = state.ui.sort;
    els.requireResultToggle.checked = !!state.settings.requireResultForDone;
    syncFilterPanel();
    updateResultHint();
    renderAll();

    if (!initData.available) {
      showBanner('Данные не сохраняются: браузер блокирует локальное хранилище. Приложение работает только до закрытия страницы.');
    } else if (initData.corrupted) {
      showBanner('Данные повреждены. Создана резервная копия, список задач начат заново.');
    }

    purgeOldDeleted().then(function (count) {
      if (count > 0) {
        renderAll();
        showToast('Из корзины удалены задачи старше 30 дней: ' + count, { type: 'info', duration: 6000 });
      }
    }).catch(function () {
      /* storage is unavailable — nothing else to do */
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
