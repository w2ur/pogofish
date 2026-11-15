// Vite's ?raw suffix imports a file's text; theme.css is adopted that way.
declare module '*?raw' {
  const text: string;
  export default text;
}
