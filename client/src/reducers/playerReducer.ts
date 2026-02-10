import type { PlayerState } from '../types/player'

export type Action =
  | { type: 'SET_STATE'; payload: Partial<PlayerState> }
  | {
      type: 'SET_LOADING'
      key: 'loadingShowData' | 'loadingVideo' | 'loadingDetails'
      value: boolean
    }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SHOW_DATA_SUCCESS'; payload: Partial<PlayerState> }
  | { type: 'VIDEO_DATA_SUCCESS'; payload: Partial<PlayerState> }

export const initialState: PlayerState = {
  showMeta: {},
  episodes: [],
  watchedEpisodes: [],
  currentEpisode: undefined,
  allMangaDetails: null,
  showCombinedDetails: false,
  currentMode: 'sub',
  inWatchlist: false,
  videoSources: [],
  selectedSource: null,
  selectedLink: null,
  isAutoplayEnabled: localStorage.getItem('autoplayEnabled') === 'true',
  showResumeModal: false,
  resumeTime: 0,
  skipIntervals: [],
  loadingShowData: true,
  loadingVideo: false,
  loadingDetails: false,
  error: null,
  detailsError: null,
}

export function playerReducer(state: PlayerState, action: Action): PlayerState {
  switch (action.type) {
    case 'SET_STATE':
      return { ...state, ...action.payload }
    case 'SET_LOADING':
      return { ...state, [action.key]: action.value }
    case 'SET_ERROR':
      return { ...state, error: action.payload, loadingShowData: false, loadingVideo: false }
    case 'SHOW_DATA_SUCCESS':
      return { ...state, ...action.payload, loadingShowData: false, error: null }
    case 'VIDEO_DATA_SUCCESS':
      return { ...state, ...action.payload, loadingVideo: false, error: null }
    default:
      return state
  }
}
