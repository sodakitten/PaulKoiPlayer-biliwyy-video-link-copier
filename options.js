const PRIMARY_PREFIX = 'https://danmaku.paulkoishi.com/player/?url=';
const BACKUP_PREFIX = 'https://biliplayer.91vrchat.com/player/?url=';

const DEFAULT_CONFIG = {
  prefix: PRIMARY_PREFIX,
  encodeUrl: true,
  priority: 'prefix',
  doubleClickAction: 'direct',
  prefixMigratedToDanmaku: false
};

const priorityEl = document.getElementById('priority');
const prefixEl = document.getElementById('prefix');
const encodeEl = document.getElementById('encodeUrl');
const statusEl = document.getElementById('status');
const previewEl = document.getElementById('preview');
const backupPrefixEl = document.getElementById('useBackupPrefix');
const doubleClickToggleEl = document.getElementById('toggleDoubleClick');

const sampleUrl = 'https://www.bilibili.com/video/BVxxxxxx/?p=1';
let doubleClickAction = DEFAULT_CONFIG.doubleClickAction;

function updatePreview() {
  const prefix = prefixEl.value.trim() || DEFAULT_CONFIG.prefix;
  const urlPart = encodeEl.checked ? encodeURIComponent(sampleUrl) : sampleUrl;
  previewEl.textContent = prefix + urlPart;
  updateExtraButtons();
}

function updateExtraButtons() {
  backupPrefixEl.textContent = prefixEl.value.trim() === BACKUP_PREFIX
    ? '切换默认解析地址'
    : '切换备用解析地址';

  doubleClickToggleEl.textContent = doubleClickAction === 'direct'
    ? '双击：解析直链'
    : '双击：解析地址';
}

async function load() {
  let cfg = await chrome.storage.sync.get(DEFAULT_CONFIG);
  if (cfg.prefix === BACKUP_PREFIX && cfg.prefixMigratedToDanmaku !== true) {
    cfg = {
      ...cfg,
      prefix: DEFAULT_CONFIG.prefix,
      prefixMigratedToDanmaku: true
    };
    await chrome.storage.sync.set({
      prefix: cfg.prefix,
      prefixMigratedToDanmaku: true
    });
  }

  priorityEl.value = cfg.priority === 'direct' ? 'direct' : 'prefix';
  prefixEl.value = cfg.prefix || DEFAULT_CONFIG.prefix;
  encodeEl.checked = cfg.encodeUrl !== false;
  doubleClickAction = cfg.doubleClickAction === 'prefix' ? 'prefix' : 'direct';
  updatePreview();
}

async function save() {
  await chrome.storage.sync.set({
    priority: priorityEl.value === 'direct' ? 'direct' : 'prefix',
    prefix: prefixEl.value.trim() || DEFAULT_CONFIG.prefix,
    encodeUrl: encodeEl.checked,
    doubleClickAction,
    prefixMigratedToDanmaku: true
  });
  statusEl.textContent = '已保存';
  updatePreview();
  setTimeout(() => statusEl.textContent = '', 1500);
}

async function reset() {
  priorityEl.value = DEFAULT_CONFIG.priority;
  prefixEl.value = DEFAULT_CONFIG.prefix;
  encodeEl.checked = DEFAULT_CONFIG.encodeUrl;
  doubleClickAction = DEFAULT_CONFIG.doubleClickAction;
  await save();
}

async function toggleBackupPrefix() {
  prefixEl.value = prefixEl.value.trim() === BACKUP_PREFIX ? DEFAULT_CONFIG.prefix : BACKUP_PREFIX;
  await save();
}

async function toggleDoubleClickAction() {
  doubleClickAction = doubleClickAction === 'direct' ? 'prefix' : 'direct';
  await save();
}

document.getElementById('save').addEventListener('click', save);
document.getElementById('reset').addEventListener('click', reset);
backupPrefixEl.addEventListener('click', toggleBackupPrefix);
doubleClickToggleEl.addEventListener('click', toggleDoubleClickAction);
priorityEl.addEventListener('change', updatePreview);
prefixEl.addEventListener('input', updatePreview);
encodeEl.addEventListener('change', updatePreview);

load();
