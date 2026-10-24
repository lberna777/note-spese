// File dei caratteri letti come testo base64 (vedi il plugin `ttfBase64` in vite.config.ts).
declare module '*.ttf?base64' {
  const base64: string;
  export default base64;
}
