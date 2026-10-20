import { ELEMENTS, STORAGE_KEY, newDocument, addToDocument, undoDocument, demoDocument, parseDocument } from './mosaic.js';
import { DEFAULT_SETTINGS, VISUAL_KEY, parseSettings } from './appearance.js';
import { MosaicRenderer } from './renderer.js';
import { paletteFor } from './palettes.js';
const $ = selector => document.querySelector(selector);
let doc = newDocument(), selectedId = null, saveError = false;
let settings = { ...DEFAULT_SETTINGS };
try { settings = parseSettings(localStorage.getItem(VISUAL_KEY)); } catch {}
applyTheme();
$('.mosaic-frame').style.setProperty('--preview-width', `${settings.width}px`);
const renderer = new MosaicRenderer($('#mosaic'), settings, id => select(id), ({ width, gap }) => {
  $('#preview-value').textContent = `${Math.round(width)} px`;
  $('#gap-note').textContent = gap < settings.gap - .05 ? `Gap limited to ${gap.toFixed(1)} px to protect small tiles.` : 'Appearance only. Your arrangement stays the same.';
});
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
$('#activity-form').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('#activity-name'), name = input.value.trim(), element = new FormData(event.currentTarget).get('element');
  if (!name) { input.setCustomValidity('Give this activity a name.'); input.reportValidity(); return; }
  try { const next = addToDocument(doc, name, element); commit(next, `${name} added. ${next.current.pieces.length} activities.`, next.current.nextId - 1); input.value = ''; }
  catch (error) { showError(error.message); }
});
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

function syncVisualControls() {
  $('#dark-mode').checked = settings.darkMode;
  $('#palette-name').textContent = settings.darkMode ? 'Charcoal · soft colors' : 'Warm white · bright colors';
  for (const key of ['gap', 'texture', 'shadow', 'motion', 'width']) {
    $(`[data-setting="${key}"]`).value = settings[key];
    const output = $(`#${key}-value`);
    if (output) output.textContent = key === 'gap' ? `${settings[key].toFixed(1)} px` : key === 'texture' ? `${settings[key]}%` : `${settings[key].toFixed(1)}×`;
  }
  document.querySelectorAll('[name="finish"]').forEach(input => { input.checked = input.value === settings.finish; });
  $('[data-setting="texture"]').disabled = settings.finish !== 'frosted';
}
function applyVisualSettings() {
  syncVisualControls(); $('.mosaic-frame').style.setProperty('--preview-width', `${settings.width}px`);
  renderer.setSettings(settings);
  saveVisualSettings();
}
function saveVisualSettings() {
  try { localStorage.setItem(VISUAL_KEY, JSON.stringify(settings)); } catch { showError('These visual settings could not be saved by your browser.'); }
}
function applyTheme() {
  document.documentElement.dataset.theme = settings.darkMode ? 'dark' : 'light';
  $('meta[name="theme-color"]').content = paletteFor(settings).background;
}
$('#dark-mode').addEventListener('change', event => {
  settings = { ...settings, darkMode: event.target.checked };
  applyTheme(); applyVisualSettings();
});
document.querySelectorAll('[data-setting]').forEach(input => input.addEventListener('input', () => { settings = { ...settings, [input.dataset.setting]: Number(input.value) }; applyVisualSettings(); }));
document.querySelectorAll('[name="finish"]').forEach(input => input.addEventListener('change', () => { if (input.checked) { settings = { ...settings, finish: input.value }; applyVisualSettings(); } }));
$('#fit-preview').addEventListener('click', () => { settings = { ...settings, width: Math.min(1100, Math.max(350, Math.round($('.mosaic-stage').clientWidth))) }; applyVisualSettings(); });
syncVisualControls(); saveVisualSettings();

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
