import { getSettings, saveSettings } from './lib/store.js';

const $ = (id) => document.getElementById(id);

async function load() {
  const s = await getSettings();
  $('folderName').value = s.folderName;
  $('intervalHours').value = s.intervalHours;
  $('notify').checked = !!s.notify;
  $('autoClean').checked = !!s.autoClean;
  $('providerOrder').value = s.providerOrder;
  $('comickBase').value = s.comickBase || '';
}

$('save').addEventListener('click', async () => {
  const before = await getSettings();
  const typedName = $('folderName').value.trim() || 'Manga';
  const next = await saveSettings({
    folderName: typedName,
    // a typed name is an explicit choice: look it up by name (or create it), never auto-detect another folder
    ...(typedName !== before.folderName ? { folderId: null, folderChosen: true } : {}),
    intervalHours: Math.min(168, Math.max(1, Number($('intervalHours').value) || 6)),
    notify: $('notify').checked,
    autoClean: $('autoClean').checked,
    providerOrder: $('providerOrder').value,
    comickBase: $('comickBase').value.trim().replace(/\/+$/, ''),
  });
  await chrome.runtime.sendMessage({ type: 'reschedule' });
  if (next.folderName !== before.folderName || next.providerOrder !== before.providerOrder || next.comickBase !== before.comickBase) {
    await chrome.storage.local.set({ matches: {}, results: {}, pendingFolder: null, adoptedFolder: null });
    chrome.runtime.sendMessage({ type: 'refresh', force: true });
  }
  $('saved').textContent = 'Saved';
  setTimeout(() => ($('saved').textContent = ''), 2000);
});

load();
