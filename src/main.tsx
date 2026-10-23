import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';

registerSW({ immediate: true });
render(<App />, document.getElementById('app')!);
