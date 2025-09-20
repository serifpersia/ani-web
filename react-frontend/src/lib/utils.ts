const thumbnailCache = new Map<string, string>();

export const fixThumbnailUrl = (url: string | undefined): string => {
  if (!url || url.trim() === '') return '/placeholder.png'; // Handle undefined or empty/whitespace URLs
  if (thumbnailCache.has(url)) return thumbnailCache.get(url)!; // Use '!' because we know it exists
  const proxiedUrl = `/api/image-proxy?url=${encodeURIComponent(url)}`;
  thumbnailCache.set(url, proxiedUrl);
  return proxiedUrl;
};

export const formatTime = (timeInSeconds: number): string => {
    if (isNaN(timeInSeconds) || timeInSeconds <= 0) return '00:00';
    const result = new Date(timeInSeconds * 1000).toISOString().slice(11, 19);
    const hours = parseInt(result.slice(0, 2), 10);
    return hours > 0 ? result : result.slice(3);
  };