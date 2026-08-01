declare module 'freekeys' {
  interface FreeKeys {
    tmdb_key?: string
    [key: string]: string | undefined
  }

  function getKeys(): Promise<FreeKeys>

  export { getKeys }
  export default { getKeys }
}
