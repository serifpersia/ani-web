/**
 * Axios HTTP client configuration
 */

import axios from 'axios'
import { ACCEPT_ENCODING_HEADER, USER_AGENT_HEADER, ACCEPT_HEADER } from '../utils/constants.js'

const clientConfig = {
  timeout: 8000,
  headers: {
    Accept: ACCEPT_HEADER,
    'User-Agent': USER_AGENT_HEADER,
    'Accept-Encoding': ACCEPT_ENCODING_HEADER,
  },
}

export const client = axios.create(clientConfig)
export type { AxiosError } from 'axios'
