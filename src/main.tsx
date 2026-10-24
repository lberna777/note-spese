import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { applyTheme, DEFAULT_THEME } from './theme';

// Subito il tema neutro (variabili CSS), poi quello salvato appena i dati sono pronti.
applyTheme(DEFAULT_THEME);
registerSW({ immediate: true });
render(<App />, document.getElementById('app')!);
