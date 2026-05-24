export interface SuggestedEpisode {
  showId: string
  episodeNumber: string
  resumeTime: number
}

export async function getSuggestedEpisode(showId: string): Promise<SuggestedEpisode> {
  const response = await fetch(`/api/queue/suggested/${showId}`)
  if (!response.ok) {
    throw new Error('Failed to resolve suggested episode')
  }
  return response.json()
}
