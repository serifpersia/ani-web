const thumbnailCache = new Map<string, string>();

export const fixThumbnailUrl = (url: string | undefined): string => {
  if (!url || url.trim() === '') return '/placeholder.png';
  if (thumbnailCache.has(url)) return thumbnailCache.get(url)!;

  let finalUrl: string;
  if (url.startsWith('https://ytimgf.youtube-anime.com/images/')) {
    finalUrl = url.replace('https://ytimgf.youtube-anime.com/images/', 'https://wp.youtube-anime.com/aln.youtube-anime.com/') + '?w=250';
  } else if (url.startsWith('https://cdnimg.xyz')) {
    finalUrl = `https://wp.youtube-anime.com/${url.substring('https://'.length)}?w=250`;
  } else if (url.startsWith('https://aln.youtube-anime.com')) {
    finalUrl = url.replace('https://aln.youtube-anime.com/', 'https://wp.youtube-anime.com/aln.youtube-anime.com/images/') + '?w=250';
  } else if (url.startsWith('__Show__')) {
    finalUrl = `https://wp.youtube-anime.com/aln.youtube-anime.com/images/${url}?w=250`;
  } else if (url.startsWith('mcovers')) {
    finalUrl = `https://wp.youtube-anime.com/aln.youtube-anime.com/${url}`;
  } else if (url.startsWith('https://gogocdn.net')) {
    finalUrl = `https://wp.youtube-anime.com/${url.substring('https://'.length)}?w=250`;
  } else if (url.startsWith('http')) {
    finalUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
  } else if (url.startsWith('images2')) {
    finalUrl = `https://wp.youtube-anime.com/aln.youtube-anime.com/${url}?w=250`;
  } else {
    finalUrl = `https://wp.youtube-anime.com/aln.youtube-anime.com/images/${url}?w=250`;
  }

  thumbnailCache.set(url, finalUrl);
  return finalUrl;
};

export const formatTime = (timeInSeconds: number): string => {
    if (isNaN(timeInSeconds) || timeInSeconds <= 0) return '00:00';
    const result = new Date(timeInSeconds * 1000).toISOString().slice(11, 19);
    const hours = parseInt(result.slice(0, 2), 10);
    return hours > 0 ? result : result.slice(3);
  };