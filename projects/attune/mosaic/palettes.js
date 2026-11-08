// Final Attune Colors variables: shared element primitives in Light and Dark modes.
const colors = Object.freeze({ fire: '#D8775A', earth: '#9EBD55', water: '#4EB5AF', air: '#E9D97A' });
export const PALETTES = Object.freeze({ light: Object.freeze({ background: '#FFFCF0', colors }), dark: Object.freeze({ background: '#262626', colors }) });
export const paletteFor = settings => PALETTES[settings.darkMode ? 'dark' : 'light'];
export const colorFor = (element, settings) => paletteFor(settings).colors[element];
