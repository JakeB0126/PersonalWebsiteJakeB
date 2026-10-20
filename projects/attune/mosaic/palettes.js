// Exact dominant RGB colors sampled from the supplied, unmodified symbol sheets.
// Sources: ../assets/symbols-warm.png and ../assets/symbols-charcoal.png.
export const PALETTES = Object.freeze({
  light: Object.freeze({ background: '#FFFCF0', colors: Object.freeze({ fire: '#D91816', earth: '#749020', water: '#0079C7', air: '#DDA801' }) }),
  dark: Object.freeze({ background: '#262626', colors: Object.freeze({ fire: '#D36341', earth: '#8BA74B', water: '#439C96', air: '#E9DF6F' }) }),
});
export const paletteFor = settings => PALETTES[settings.darkMode ? 'dark' : 'light'];
export const colorFor = (element, settings) => paletteFor(settings).colors[element];
// Use the sheet background as contrasting negative space inside each symbol.
export const inkFor = (element, settings) => !settings.darkMode && ['fire', 'water'].includes(element) ? PALETTES.light.background : PALETTES.dark.background;
