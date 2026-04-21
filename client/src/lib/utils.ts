const thumbnailCache = new Map<string, string>()

export const fixThumbnailUrl = (
  url: string | undefined,
  width?: number,
  height?: number
): string => {
  if (!url || url.trim() === '') return '/placeholder.svg'

  if (url.includes('/api/image-proxy')) {
    let finalUrl = url
    if (width) finalUrl += `&w=${width}`
    if (height) finalUrl += `&h=${height}`
    return finalUrl
  }

  let optimizedUrl = url
  if (url.includes('s4.anilist.co') && url.includes('/large/')) {
    optimizedUrl = url.replace('/large/', '/medium/')
  }

  const cacheKey = `${optimizedUrl}-${width}-${height}`
  if (thumbnailCache.has(cacheKey)) {
    return thumbnailCache.get(cacheKey)!
  }

  let transformedUrl: string
  if (optimizedUrl.startsWith('https://ytimgf.youtube-anime.com/images/')) {
    transformedUrl = optimizedUrl.replace(
      'https://ytimgf.youtube-anime.com/images/',
      'https://wp.youtube-anime.com/aln.youtube-anime.com/'
    )
  } else if (optimizedUrl.startsWith('https://cdnimg.xyz')) {
    transformedUrl = `https://wp.youtube-anime.com/${optimizedUrl.substring('https://'.length)}`
  } else if (optimizedUrl.startsWith('https://aln.youtube-anime.com')) {
    transformedUrl = optimizedUrl.replace(
      'https://aln.youtube-anime.com/',
      'https://wp.youtube-anime.com/aln.youtube-anime.com/images/'
    )
  } else if (optimizedUrl.startsWith('__Show__')) {
    transformedUrl = `https://wp.youtube-anime.com/aln.youtube-anime.com/images/${optimizedUrl}`
  } else if (optimizedUrl.startsWith('mcovers')) {
    transformedUrl = `https://wp.youtube-anime.com/aln.youtube-anime.com/${optimizedUrl}`
  } else if (optimizedUrl.startsWith('https://gogocdn.net')) {
    transformedUrl = `https://wp.youtube-anime.com/${optimizedUrl.substring('https://'.length)}`
  } else if (optimizedUrl.startsWith('http')) {
    transformedUrl = optimizedUrl
  } else if (optimizedUrl.startsWith('images2')) {
    transformedUrl = `https://wp.youtube-anime.com/aln.youtube-anime.com/${optimizedUrl}`
  } else {
    transformedUrl = `https://wp.youtube-anime.com/aln.youtube-anime.com/images/${optimizedUrl}`
  }

  let finalUrl: string
  if (transformedUrl.startsWith('http')) {
    finalUrl = `/api/image-proxy?url=${encodeURIComponent(transformedUrl)}`
  } else {
    finalUrl = transformedUrl
  }

  if (width || height) {
    const separator = finalUrl.includes('?') ? '&' : '?'
    if (width) finalUrl += `${separator}w=${width}`
    if (height) finalUrl += `&h=${height}`
  } else if (finalUrl.includes('image-proxy')) {
    finalUrl += '&w=300'
  }

  thumbnailCache.set(cacheKey, finalUrl)
  return finalUrl
}

export const formatTime = (timeInSeconds: number): string => {
  if (isNaN(timeInSeconds) || timeInSeconds <= 0) return '00:00'
  const result = new Date(timeInSeconds * 1000).toISOString().slice(11, 19)
  const hours = parseInt(result.slice(0, 2), 10)
  return hours > 0 ? result : result.slice(3)
}
