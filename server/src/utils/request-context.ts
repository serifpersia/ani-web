import { AsyncLocalStorage } from 'node:async_hooks'

export const requestContext = new AsyncLocalStorage<Map<string, string>>()
