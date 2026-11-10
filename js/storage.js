(function () {
  'use strict';

  const KEYS = {
    tasks: 'todo.tasks.v1',
    settings: 'todo.settings.v1',
    ui: 'todo.ui.v1'
  };

  const SORTS = ['deadline_asc', 'deadline_desc', 'created_desc', 'created_asc', 'title_asc', 'status', 'important'];
  const STATUSES = ['new', 'in_progress', 'done'];
  const memory = { tasks: [], settings: { requireResultForDone: false }, ui: { sort: 'deadline_asc' } };
  let available = true;
  let dbPromise = null;

  function nowISO() {
    return new Date().toISOString();
  }

  function notifyError(message) {
    try {
      window.dispatchEvent(new CustomEvent('todo:storage-error', { detail: { message: message } }));
    } catch (error) {
      /* no-op */
    }
  }

  function checkAvailability() {
    try {
      const probe = '__todo_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      available = true;
    } catch (error) {
      available = false;
    }
    return available;
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function normalizeComment(comment) {
    if (!isObject(comment) || typeof comment.text !== 'string') return null;
    return {
      id: typeof comment.id === 'string' ? comment.id : String(Date.now()) + Math.random().toString(16).slice(2),
      text: comment.text,
      createdAt: typeof comment.createdAt === 'string' ? comment.createdAt : nowISO()
    };
  }

  function normalizeAttachment(attachment) {
    if (!isObject(attachment) || typeof attachment.name !== 'string') return null;
    return {
      id: typeof attachment.id === 'string' ? attachment.id : String(Date.now()) + Math.random().toString(16).slice(2),
      name: attachment.name,
      type: typeof attachment.type === 'string' ? attachment.type : 'application/octet-stream',
      size: Number.isFinite(Number(attachment.size)) ? Number(attachment.size) : 0,
      createdAt: typeof attachment.createdAt === 'string' ? attachment.createdAt : nowISO()
    };
  }

  function normalizeTask(task) {
    if (!isObject(task) || typeof task.id !== 'string') return null;
    const status = STATUSES.indexOf(task.status) !== -1 ? task.status : 'new';
    const createdAt = typeof task.createdAt === 'string' ? task.createdAt : nowISO();
    return {
      id: task.id,
      title: typeof task.title === 'string' ? task.title : '',
      description: typeof task.description === 'string' ? task.description : '',
      deadline: validDate(task.deadline) ? task.deadline : null,
      status: status,
      result: typeof task.result === 'string' ? task.result : '',
      important: !!task.important,
      comments: Array.isArray(task.comments) ? task.comments.map(normalizeComment).filter(Boolean) : [],
      attachments: Array.isArray(task.attachments) ? task.attachments.map(normalizeAttachment).filter(Boolean) : [],
      createdAt: createdAt,
      updatedAt: typeof task.updatedAt === 'string' ? task.updatedAt : createdAt,
      completedAt: typeof task.completedAt === 'string' ? task.completedAt : null,
      deletedAt: typeof task.deletedAt === 'string' ? task.deletedAt : null
    };
  }

  function loadTasks() {
    if (!available) {
      return { tasks: Array.isArray(memory.tasks) ? memory.tasks.slice() : [], corrupted: false, unavailable: true };
    }

    let raw = null;
    try {
      raw = window.localStorage.getItem(KEYS.tasks);
    } catch (error) {
      available = false;
      return { tasks: [], corrupted: false, unavailable: true };
    }

    if (!raw) return { tasks: [], corrupted: false, unavailable: false };

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Tasks storage is not an array');
      return {
        tasks: parsed.map(normalizeTask).filter(Boolean),
        corrupted: false,
        unavailable: false
      };
    } catch (error) {
      let backupKey = null;
      try {
        backupKey = KEYS.tasks + '.corrupt.' + Date.now();
        window.localStorage.setItem(backupKey, raw);
      } catch (backupError) {
        backupKey = null;
      }
      return { tasks: [], corrupted: true, backupKey: backupKey, unavailable: false };
    }
  }

  function saveTasks(tasks) {
    const safeTasks = Array.isArray(tasks) ? tasks : [];
    memory.tasks = safeTasks.slice();
    if (!available) {
      notifyError('Данные не сохраняются: браузер блокирует локальное хранилище.');
      return false;
    }
    try {
      window.localStorage.setItem(KEYS.tasks, JSON.stringify(safeTasks));
      return true;
    } catch (error) {
      notifyError('Не удалось сохранить данные. Изменения могут быть потеряны после закрытия страницы.');
      return false;
    }
  }

  function loadSettings() {
    if (!available) return Object.assign({}, memory.settings);
    try {
      const raw = window.localStorage.getItem(KEYS.settings);
      if (!raw) return { requireResultForDone: false };
      const parsed = JSON.parse(raw);
      return { requireResultForDone: !!(parsed && parsed.requireResultForDone) };
    } catch (error) {
      return { requireResultForDone: false };
    }
  }

  function saveSettings(settings) {
    const safe = { requireResultForDone: !!(settings && settings.requireResultForDone) };
    memory.settings = safe;
    if (!available) {
      notifyError('Настройки не сохраняются: браузер блокирует локальное хранилище.');
      return false;
    }
    try {
      window.localStorage.setItem(KEYS.settings, JSON.stringify(safe));
      return true;
    } catch (error) {
      notifyError('Не удалось сохранить настройки.');
      return false;
    }
  }

  function loadUI() {
    if (!available) return Object.assign({}, memory.ui);
    try {
      const raw = window.localStorage.getItem(KEYS.ui);
      if (!raw) return { sort: 'deadline_asc' };
      const parsed = JSON.parse(raw);
      return { sort: SORTS.indexOf(parsed && parsed.sort) !== -1 ? parsed.sort : 'deadline_asc' };
    } catch (error) {
      return { sort: 'deadline_asc' };
    }
  }

  function saveUI(ui) {
    const safe = { sort: SORTS.indexOf(ui && ui.sort) !== -1 ? ui.sort : 'deadline_asc' };
    memory.ui = safe;
    if (!available) return false;
    try {
      window.localStorage.setItem(KEYS.ui, JSON.stringify(safe));
      return true;
    } catch (error) {
      return false;
    }
  }

  function indexedDBSupported() {
    return typeof window.indexedDB !== 'undefined';
  }

  function openDB() {
    if (!indexedDBSupported()) {
      return Promise.reject(new Error('IndexedDB не поддерживается'));
    }
    if (dbPromise) return dbPromise;

    dbPromise = new Promise(function (resolve, reject) {
      let request;
      try {
        request = window.indexedDB.open('todo-db', 1);
      } catch (error) {
        reject(error);
        return;
      }

      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains('files')) {
          const store = db.createObjectStore('files', { keyPath: 'id' });
          store.createIndex('taskId', 'taskId', { unique: false });
        }
      };

      request.onsuccess = function () {
        const db = request.result;
        db.onversionchange = function () {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = function () {
        reject(request.error || new Error('Не удалось открыть хранилище файлов'));
      };

      request.onblocked = function () {
        reject(new Error('Хранилище файлов занято другой вкладкой'));
      };
    });

    return dbPromise;
  }

  function saveFile(record) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put(record);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error || new Error('Не удалось сохранить файл')); };
        tx.onabort = function () { reject(tx.error || new Error('Сохранение файла отменено')); };
      });
    });
  }

  function getFile(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction('files', 'readonly');
        const request = tx.objectStore('files').get(id);
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(request.error || new Error('Не удалось прочитать файл')); };
      });
    });
  }

  function hasFile(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction('files', 'readonly');
        const request = tx.objectStore('files').count(id);
        request.onsuccess = function () { resolve(request.result > 0); };
        request.onerror = function () { reject(request.error || new Error('Не удалось проверить файл')); };
      });
    });
  }

  function deleteFile(id) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').delete(id);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error || new Error('Не удалось удалить файл')); };
      });
    });
  }

  function deleteFilesByTask(taskId) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction('files', 'readwrite');
        const store = tx.objectStore('files');
        const index = store.index('taskId');
        const request = index.openCursor(window.IDBKeyRange.only(taskId));
        request.onsuccess = function () {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
        request.onerror = function () { reject(request.error || new Error('Не удалось удалить файлы задачи')); };
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error || new Error('Не удалось удалить файлы задачи')); };
      });
    });
  }

  function init() {
    const storageAvailable = checkAvailability();
    const loaded = loadTasks();
    return {
      available: storageAvailable,
      tasks: loaded.tasks,
      corrupted: loaded.corrupted,
      backupKey: loaded.backupKey,
      settings: loadSettings(),
      ui: loadUI()
    };
  }

  window.TodoStorage = {
    KEYS: KEYS,
    SORTS: SORTS,
    STATUSES: STATUSES,
    init: init,
    isAvailable: function () { return available; },
    loadTasks: loadTasks,
    saveTasks: saveTasks,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    loadUI: loadUI,
    saveUI: saveUI,
    indexedDBSupported: indexedDBSupported,
    saveFile: saveFile,
    getFile: getFile,
    hasFile: hasFile,
    deleteFile: deleteFile,
    deleteFilesByTask: deleteFilesByTask
  };
})();
