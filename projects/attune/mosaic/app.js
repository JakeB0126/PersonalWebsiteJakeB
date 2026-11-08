import { ELEMENTS, STORAGE_KEY, newDocument, addToDocument, undoDocument, demoDocument, parseDocument } from './mosaic.js';
import { DEFAULT_SETTINGS, VISUAL_KEY, parseSettings } from './appearance.js';
import { MosaicRenderer } from './renderer.js';
import { paletteFor } from './palettes.js';
const $ = selector => document.querySelector(selector);
let doc = newDocument(), selectedId = null, saveError = false;
let settings = { ...DEFAULT_SETTINGS };
try { settings.darkMode = parseSettings(localStorage.getItem(VISUAL_KEY)).darkMode; } catch {}
// Fixed approved preset ignores all legacy appearance overrides, preserving activities.
applyTheme();
$('.mosaic-frame').style.setProperty('--preview-width', `${settings.width}px`);
const renderer = new MosaicRenderer($('#mosaic'), settings, id => select(id), () => {});
try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) doc = parseDocument(saved); }
catch { showError('Your saved mosaic couldn’t be loaded. You can start a new one below.'); }
function showError(message) { $('#error').textContent = message; $('#error').hidden = false; }
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(doc)); saveError = false; }
  catch { saveError = true; showError('Your browser couldn’t save this mosaic. You can keep exploring, but these changes may be lost on refresh.'); }
}
function select(id) { selectedId = id; renderDetails(); renderSelection(); }
function renderSelection() { renderer.select(selectedId); }
function renderDetails() {
  const selected = doc.current.pieces.find(p => p.activity.id === selectedId);
  $('#detail-name').textContent = selected ? selected.activity.name : doc.current.pieces.length ? 'Explore your mosaic' : 'A space for your week';
  $('#detail-element').textContent = selected ? `${ELEMENTS[selected.activity.element].label} · ${ELEMENTS[selected.activity.element].meaning}` : doc.current.pieces.length ? 'Press a tile to feel it. Click to see its activity.' : 'Your activities will appear here.';
  $('.detail-marker').style.background = selected ? `var(--${selected.activity.element})` : 'var(--background)';
  $('#deselect').hidden = !selected;
  $('#detail-reflection').hidden = !selected?.activity.reflection;
  $('#detail-reflection').textContent = selected?.activity.reflection || '';
  if (selected?.activity.occurredAt) $('#detail-element').textContent += ` · ${new Date(selected.activity.occurredAt).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`;
}
function render(transition = {}) {
  renderer.render(doc.current.pieces, transition);
  const count = doc.current.pieces.length;
  $('#activity-count').textContent = `${count} ${count === 1 ? 'activity' : 'activities'}`;
  $('#empty').hidden = count > 0; $('#undo').disabled = doc.history.length === 0;
  $('#save-status').textContent = saveError ? 'Not saved · browser storage unavailable' : 'Saved on this device';
  renderDetails(); renderSelection();
}
function commit(nextDoc, message, selected = null, animate = true) {
  const before = doc.current.pieces;
  doc = nextDoc; selectedId = selected; $('#error').hidden = true; save(); render({ before, animate }); $('#announcement').textContent = message;
}
let chosenElement = null;
function localNow() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16); }
function setStep(details) {
  $('#choose-step').hidden = details; $('#details-step').hidden = !details;
  $('#activity-name').required = details; $('#activity-date').required = details;
  $('#cancel-log').hidden = !details && !chosenElement;
}
function resetDraft() { $('#activity-form').reset(); chosenElement = null; $('#activity-date').value = localNow(); $('#discard-prompt').hidden = true; $('.reflection').open = false; setStep(false); }
document.querySelectorAll('[data-element]').forEach(button => button.addEventListener('click', () => {
  chosenElement = button.dataset.element; $('#chosen-label').textContent = ELEMENTS[chosenElement].label;
  $('#chosen-label').style.borderColor = `var(--${chosenElement})`; setStep(true); $('#activity-name').focus();
}));
$('#change-element').addEventListener('click', () => { setStep(false); $(`[data-element="${chosenElement}"]`).focus(); });
$('#cancel-log').addEventListener('click', () => {
  if ($('#activity-name').value.trim() || $('#activity-reflection').value.trim()) { $('#discard-prompt').hidden = false; $('#keep-draft').focus(); }
  else { resetDraft(); $('[data-element]').focus(); }
});
$('#keep-draft').addEventListener('click', () => { $('#discard-prompt').hidden = true; $('#cancel-log').focus(); });
$('#discard-draft').addEventListener('click', () => { resetDraft(); $('[data-element]').focus(); });
$('#activity-form').addEventListener('submit', event => {
  event.preventDefault(); const input = $('#activity-name'), name = input.value.trim();
  if (!chosenElement) return;
  if (!name) { input.setCustomValidity('Give this activity a name.'); input.reportValidity(); return; }
  try {
    const next = addToDocument(doc, name, chosenElement);
    const activity = next.current.pieces.at(-1).activity;
    activity.occurredAt = $('#activity-date').value;
    activity.reflection = $('#activity-reflection').value.trim();
    commit(next, `${name} added. ${next.current.pieces.length} activities.`, activity.id);
    resetDraft(); $('[data-element]').focus();
  } catch (error) { showError(error.message); }
});
resetDraft();
$('#activity-name').addEventListener('input', event => event.target.setCustomValidity(''));
$('#undo').addEventListener('click', () => { if (doc.history.length) commit(undoDocument(doc), 'Last activity undone. Previous mosaic restored.'); });
$('#deselect').addEventListener('click', () => { const piece = $('#mosaic').querySelector(`[data-id="${selectedId}"]`); select(null); piece?.focus(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && selectedId !== null) $('#deselect').click(); });
document.querySelectorAll('[data-demo]').forEach(button => button.addEventListener('click', () => {
  try { const count = Number(button.dataset.demo); commit(demoDocument(count), `Loaded ${count} sample activities. Undo removes them one at a time.`, null, false); }
  catch (error) { showError(error.message); }
}));
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY && event.newValue) { try { doc = parseDocument(event.newValue); selectedId = null; render(); } catch { showError('A saved update could not be loaded.'); } } });
render();

function syncVisualControls() { $('#dark-mode').checked = settings.darkMode; $('#palette-name').textContent = settings.darkMode ? 'Dark mode' : 'Light mode'; }
function applyTheme() { document.documentElement.dataset.theme = settings.darkMode ? 'dark' : 'light'; $('meta[name="theme-color"]').content = paletteFor(settings).background; }
$('#dark-mode').addEventListener('change', event => { settings.darkMode = event.target.checked; applyTheme(); syncVisualControls(); renderer.setSettings(settings); try { localStorage.setItem(VISUAL_KEY, JSON.stringify({darkMode:settings.darkMode})); } catch {} });
syncVisualControls();
// Send content height rather than tying the layout to iframe height (avoids resize loops).
function reportHeight() { if (parent !== window) parent.postMessage({type:'attune:mosaic-height',height:Math.ceil($('.app').getBoundingClientRect().height)}, location.origin === 'null' ? '*' : location.origin); }
new ResizeObserver(reportHeight).observe($('.app')); window.addEventListener('load', reportHeight);

// Optional page-scoped tools use the same immutable actions as the visible UI.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const result = () => ({ activities: doc.current.pieces.map(p => p.activity), undoAvailable: doc.history.length > 0, saved: !saveError });
  const definitions = [
    { name: 'read_mosaic', description: 'Read the activities in the current weekly mosaic.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: result },
    { name: 'add_mosaic_activities', description: 'Add named activities to the mosaic and save them on this device. Each addition splits the largest piece and can be undone.', inputSchema: { type: 'object', properties: { activities: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 100 }, element: { type: 'string', enum: Object.keys(ELEMENTS) } }, required: ['name', 'element'], additionalProperties: false } } }, required: ['activities'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute(input) {
      if (!Array.isArray(input?.activities) || input.activities.length < 1 || input.activities.length > 20) throw new Error('Provide 1–20 activities.');
      let next = doc;
      for (const activity of input.activities) { if (typeof activity?.name !== 'string') throw new Error('An activity name is required.'); next = addToDocument(next, activity.name, activity.element); }
      commit(next, `${input.activities.length} activities added.`); return result();
    } },
    { name: 'undo_mosaic_addition', description: 'Undo the most recent activity addition and restore the exact previous mosaic.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute() { commit(undoDocument(doc), 'Last activity undone. Previous mosaic restored.'); return result(); } },
  ];
  for (const definition of definitions) { try { Promise.resolve(document.modelContext.registerTool(definition, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Unsupported experimental API must not block the app. */ } }
  window.addEventListener('pagehide', event => { if (!event.persisted) lifecycle.abort(); }, { once: true });
}
