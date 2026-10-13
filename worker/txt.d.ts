// Text files are bundled into the Worker as strings (wrangler's default rule for *.txt).
declare module '*.txt' {
  const text: string;
  export default text;
}
