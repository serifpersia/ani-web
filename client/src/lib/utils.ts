const thumbnailCache = new Map<string, string>();

export const fixThumbnailUrl = (url: string | undefined, width?: number, height?: number): string => {
  if (!url || url.trim() === '') return '/placeholder.png';
  if (url.includes('/api/image-proxy')) {
    let finalUrl = url;
    if (width) finalUrl += `&w=${width}`;
    if (height) finalUrl += `&h=${height}`;
    return finalUrl;
  }

  if (thumbnailCache.has(url)) {
    const cached = thumbnailCache.get(url)!;
    if (!width && !height) return cached;
    // If width/height requested, we might need a new URL or just append to existing if it's already a proxy URL
  }

  let finalUrl: string;
  if (url.startsWith('https://ytimgf.youtube-anime.com/images/')) {
    finalUrl = url.replace('https://ytimgf.youtube-anime.com/images/', 'https://wp.youtube-anime.com/aln.youtube-anime.com/');
  } else if (url.startsWith('https://cdnimg.xyz')) {
    finalUrl = `https://wp.youtube-anime.com/${url.substring('https://'.length)}`;
  } else if (url.startsWith('https://aln.youtube-anime.com')) {
    finalUrl = url.replace('https://aln.youtube-anime.com/', 'https://wp.youtube-anime.com/aln.youtube-anime.com/images/');
  } else if (url.startsWith('__Show__')) {
    finalUrl = `https://wp.youtube-anime.com/aln.youtube-anime.com/images/${url}`;
  } else if (url.startsWith('mcovers')) {
    finalUrl = `https://wp.youtube-anime.com/aln.youtube-anime.com/${url}`;
  } else if (url.startsWith('https://gogocdn.net')) {
    finalUrl = `https://wp.youtube-anime.com/${url.substring('https://'.length)}`;
  } else if (url.startsWith('http')) {
    finalUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
  } else if (url.startsWith('images2')) {
    finalUrl = `https://wp.youtube-anime.com/aln.youtube-anime.com/${url}`;
  } else {
    finalUrl = `https://wp.youtube-anime.com/aln.youtube-anime.com/images/${url}`;
  }

  // Append size parameters
  if (width || height) {
    if (finalUrl.includes('?')) {
      if (width) finalUrl += `&w=${width}`;
      if (height) finalUrl += `&h=${height}`;
    } else {
      if (width) finalUrl += `?w=${width}`;
      if (height) finalUrl += `&h=${height}`;
    }
  } else if (finalUrl.includes('wp.youtube-anime.com')) {
    // Default width for normal cards if not specified
    finalUrl += finalUrl.includes('?') ? '&w=500' : '?w=500';
  }

  if (!width && !height) thumbnailCache.set(url, finalUrl);
  return finalUrl;
};

export const formatTime = (timeInSeconds: number): string => {
  if (isNaN(timeInSeconds) || timeInSeconds <= 0) return '00:00';
  const result = new Date(timeInSeconds * 1000).toISOString().slice(11, 19);
  const hours = parseInt(result.slice(0, 2), 10);
  return hours > 0 ? result : result.slice(3);
};