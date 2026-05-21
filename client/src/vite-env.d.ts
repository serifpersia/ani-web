declare module 'hls.js/dist/hls.light.mjs' {
  import Hls from 'hls.js'
  export default Hls
}

interface ImportMetaEnv {
  readonly VITE_TELEMETRY_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
