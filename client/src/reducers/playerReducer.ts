import type { PlayerState, VideoSource, VideoLink } from '../types/player'

export type Action =
  | { type: 'SET_STATE'; payload: Partial<PlayerState> }
  | { type: 'SET_CURRENT_EPISODE'; payload: string | undefined }
  | { type: 'SET_MODE'; payload: 'sub' | 'dub' }
  | { type: 'SET_PROVIDER'; payload: 'allanime' | 'animepahe' | '123anime' }
  | { type: 'SET_OVERRIDE_SOURCE'; payload: { source: VideoSource; link: VideoLink } | null }

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
  forceNativePlayer: localStorage.getItem('forceNativePlayer') === 'true',
  isAutoplayEnabled: localStorage.getItem('autoplayEnabled') === 'true',
  showResumeModal: true,
  resumeTime: 0,
  resumeDuration: 0,
  skipIntervals: [],
  selectedProvider:
    (localStorage.getItem('preferredProvider') as 'allanime' | 'animepahe' | '123anime') ||
    'allanime',
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
    case 'SET_CURRENT_EPISODE':
      return { ...state, currentEpisode: action.payload }
    case 'SET_MODE':
      return { ...state, currentMode: action.payload }
    case 'SET_PROVIDER':
      return { ...state, selectedProvider: action.payload }
    case 'SET_OVERRIDE_SOURCE':
      return {
        ...state,
        selectedSource: action.payload?.source ?? null,
        selectedLink: action.payload?.link ?? null,
      }
    default:
      return state
  }
}
