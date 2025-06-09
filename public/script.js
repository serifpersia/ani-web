let currentHlsInstance = null;
let searchState = { page: 1, isLoading: false, hasMore: true };
let seasonalState = { page: 1, isLoading: false, hasMore: true };
let playerInactivityTimer = null;
function navigateTo(hash) {
   window.location.hash = hash;
}
function router() {
   const hash = window.location.hash || '#home';
   const [path, param, episode] = hash.substring(1).split('/');
   const data = { showId: param, episodeToPlay: episode };
   renderPageContent(path || 'home', data);
}
document.addEventListener('DOMContentLoaded', () => {
   setupThemeSelector();
   setupSearchFilters();
   setupHomePage();
   setupWatchlistPage();
   window.addEventListener('hashchange', router);
   router();
});
function stopVideoPlayback() {
   if (playerInactivityTimer) {
      clearTimeout(playerInactivityTimer);
      playerInactivityTimer = null;
   }
   document.body.style.cursor = 'default';
   if (currentHlsInstance) {
      currentHlsInstance.destroy();
      currentHlsInstance = null;
   }
   const playerPage = document.getElementById('player-page');
   const videoElement = playerPage.querySelector('video');
   if (videoElement) {
      videoElement.pause();
      videoElement.src = '';
      videoElement.load();
   }
}
function renderPageContent(page, data = {}) {
   stopVideoPlayback();
   document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
   const pageElement = document.getElementById(`${page}-page`);
   if (pageElement) {
      pageElement.style.display = 'block';
      window.scrollTo(0, 0);
      if (page === 'home') {
         if (document.getElementById('seasonal-anime').innerHTML === '') {
            loadHomePage();
         }
      } else if (page === 'watchlist') {
         fetchAndDisplayWatchlist();
      } else if (page === 'search') {
         document.getElementById('searchInput').focus();
      } else if (page === 'player' && data.showId) {
         fetchEpisodes(data.showId, null, null, 'sub', data.episodeToPlay);
      }
   } else {
      document.getElementById('home-page').style.display = 'block';
   }
}
function setupThemeSelector() {
    const themeSelector = document.getElementById('theme-selector');
    const savedTheme = localStorage.getItem('theme') || 'default';
    themeSelector.value = savedTheme;
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeSelector.addEventListener('change', (e) => {
        const selectedTheme = e.target.value;
        document.documentElement.setAttribute('data-theme', selectedTheme);
        localStorage.setItem('theme', selectedTheme);
    });
}
function setupHomePage() {
   const topPopularFilter = document.getElementById('top-popular-filter');
   if (topPopularFilter) {
      topPopularFilter.addEventListener('change', (e) => {
         fetchAndDisplayTopPopular(e.target.value);
      });
   }
}
function setupWatchlistPage() {
   const importBtn = document.getElementById('importMalBtn');
   const restoreDbBtn = document.getElementById('restoreDbBtn');
   if (importBtn) {
      importBtn.addEventListener('click', handleMalImport);
   }
   if (restoreDbBtn) {
      restoreDbBtn.addEventListener('click', handleDbRestore);
   }
}
async function handleMalImport() {
   const fileInput = document.getElementById('malFile');
   const eraseToggle = document.getElementById('eraseWatchlistToggle');
   const statusDiv = document.getElementById('importStatus');
   if (!fileInput.files.length) {
      statusDiv.textContent = 'Please select a file first.';
      return;
   }
   const file = fileInput.files[0];
   statusDiv.textContent = 'Importing...';
   const reader = new FileReader();
   reader.onload = async (e) => {
      try {
         const response = await fetch('/import/mal-xml', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               xml: e.target.result,
               erase: eraseToggle.checked
            })
         });
         const result = await response.json();
         if (!response.ok) {
            throw new Error(result.error || 'Failed to import watchlist.');
         }
         statusDiv.textContent = `Import complete! Imported: ${result.imported}, Skipped: ${result.skipped}.`;
         fetchAndDisplayWatchlist();
      } catch (error) {
         statusDiv.textContent = `Error: ${error.message}`;
      }
   };
   reader.onerror = () => {
      statusDiv.textContent = 'Error reading file.';
   };
   reader.readAsText(file);
}
async function handleDbRestore() {
   const fileInput = document.getElementById('restoreFile');
   const statusDiv = document.getElementById('restoreStatus');
   if (!fileInput.files.length) {
      statusDiv.textContent = 'Please select a database file to restore.';
      return;
   }
   const file = fileInput.files[0];
   if (!file.name.endsWith('.db')) {
      statusDiv.textContent = 'Invalid file type. Please select a .db file.';
      return;
   }
   const formData = new FormData();
   formData.append('dbfile', file);
   statusDiv.textContent = 'Restoring... This may take a moment.';
   try {
      const response = await fetch('/restore-db', {
         method: 'POST',
         body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
         throw new Error(result.error || 'Failed to restore database.');
      }
      statusDiv.textContent = result.message;
      alert('Database restored successfully! The page will now reload.');
      setTimeout(() => window.location.reload(), 1000);
   } catch (error) {
      statusDiv.textContent = `Error: ${error.message}`;
   }
}
async function loadHomePage() {
   setupScheduleSelector();
   await Promise.all([
      fetchAndDisplaySeasonal(),
      fetchAndDisplayTopPopular('all'),
      fetchAndDisplayEpisodeSchedule()
   ]);
   fetchAndDisplayContinueWatching();
   fetchAndDisplayLatestReleases();
}
const thumbnailCache = new Map();
function fixThumbnailUrl(url) {
   if (!url) return '/placeholder.png';
   if (thumbnailCache.has(url)) return thumbnailCache.get(url);
   const proxiedUrl = `/image-proxy?url=${encodeURIComponent(url)}`;
   thumbnailCache.set(url, proxiedUrl);
   return proxiedUrl;
}
async function fetchAndDisplaySection(endpoint, containerId, append = false) {
   const container = document.getElementById(containerId);
   try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`Failed to fetch ${endpoint}`);
      const shows = await response.json();
      displayGrid(containerId, shows, (show) => {
         navigateTo(`#player/${show._id}`);
      }, item => item.name, append);
   } catch (error) {
      console.error(`Error fetching section ${containerId}:`, error);
      if (container) container.innerHTML = `<p class="error">Could not load this section.</p>`;
   }
}
const fetchAndDisplayLatestReleases = () => fetchAndDisplaySection('/latest-releases', 'latest-releases');
async function fetchAndDisplayEpisodeSchedule(date = null) {
   if (!date) {
      date = new Date().toISOString().split('T')[0];
   }
   await fetchAndDisplaySection(`/schedule/${date}`, 'episode-schedule');
}
function setupScheduleSelector() {
   const selectorContainer = document.getElementById('schedule-day-selector');
   if (!selectorContainer) return;
   selectorContainer.innerHTML = '';
   const days = [];
   const today = new Date();
   const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
   for (let i = -6; i <= 0; i++) {
      const date = new Date();
      date.setDate(today.getDate() + i);
      days.push(date);
   }
   days.forEach(date => {
      const button = document.createElement('button');
      button.classList.add('day-button');
      const dateString = date.toISOString().split('T')[0];
      button.dataset.date = dateString;
      let dayLabel = dayNames[date.getDay()];
      if (date.toDateString() === today.toDateString()) {
         dayLabel = 'Today';
         button.classList.add('active');
      }
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      if (date.toDateString() === yesterday.toDateString()) {
         dayLabel = 'Yesterday';
      }
      const formattedDate = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      button.innerHTML = `<span class="day-name">${dayLabel}</span><span class="day-date">${formattedDate}</span>`;
      button.addEventListener('click', () => {
         document.querySelectorAll('.day-button').forEach(btn => btn.classList.remove('active'));
         button.classList.add('active');
         fetchAndDisplayEpisodeSchedule(dateString);
      });
      selectorContainer.appendChild(button);
   });
}
async function fetchAndDisplayTopPopular(timeframe = 'all') {
   const container = document.getElementById('top-10-popular');
   if (!container) return;
   container.innerHTML = '<div class="loading"></div>';
   try {
      const response = await fetch(`/popular/${timeframe}`);
      if (!response.ok) throw new Error('Failed to fetch popular');
      const shows = await response.json();
      container.innerHTML = '';
      shows.forEach((show, index) => {
         const item = document.createElement('div');
         item.className = 'top-10-item';
         item.setAttribute('data-raw-thumbnail', show.thumbnail || '');
         item.innerHTML = `
            <span class="rank-number">${String(index + 1).padStart(2, '0')}</span>
            <img src="${fixThumbnailUrl(show.thumbnail)}" alt="${show.name}" loading="lazy" onerror="this.src='/placeholder.png';"/>
            <div class="item-details">
               <p class="item-title">${show.name}</p>
               <div class="ep-counts">
                  ${show.availableEpisodes.sub ? `<span>SUB ${show.availableEpisodes.sub}</span>` : ''}
                  ${show.availableEpisodes.dub ? `<span>DUB ${show.availableEpisodes.dub}</span>` : ''}
               </div>
            </div>
         `;
         item.addEventListener('click', () => navigateTo(`#player/${show._id}`));
         container.appendChild(item);
      });
   } catch (error) {
      console.error('Error fetching top popular:', error);
      container.innerHTML = `<p class="error">Could not load top 10.</p>`;
   }
}
async function fetchAndDisplaySeasonal() {
   if (seasonalState.isLoading || !seasonalState.hasMore) return;
   seasonalState.isLoading = true;
   const container = document.getElementById('seasonal-anime');
   try {
      const response = await fetch(`/seasonal?page=${seasonalState.page}`);
      if (!response.ok) throw new Error(`Failed to fetch /seasonal`);
      const shows = await response.json();
      if (shows.length === 0) {
         seasonalState.hasMore = false;
         return;
      }
      if (seasonalState.page === 1) {
         const firstShowWithDesc = shows.find(s => s.description);
         if (firstShowWithDesc) {
            const desc = firstShowWithDesc.description;
            const yearMatch = desc.match(/Season: (?:Winter|Spring|Summer|Fall) (\d{4})/);
            const seasonMatch = desc.match(/Season: (Winter|Spring|Summer|Fall)/);
            if (yearMatch && seasonMatch) {
               document.getElementById('seasonal-title').textContent = `${seasonMatch[1]} ${yearMatch[1]}`;
            }
         }
      }
      displayGrid('seasonal-anime', shows, (show) => {
         navigateTo(`#player/${show._id}`);
      }, item => item.name, true);
      seasonalState.page++;
   } catch (error) {
      console.error('Error fetching seasonal anime:', error);
      if (container) container.innerHTML = `<p class="error">Could not load seasonal anime.</p>`;
   } finally {
      seasonalState.isLoading = false;
   }
}
async function fetchAndDisplayContinueWatching() {
   try {
      const response = await fetch('/continue-watching');
      if (!response.ok) throw new Error('Network response was not ok');
      const shows = await response.json();
      const container = document.getElementById('continue-watching');
      if (shows && shows.length > 0) {
         container.parentElement.style.display = 'block';
         displayGrid('continue-watching', shows, (show) => {
            navigateTo(`#player/${show.showId}/${show.nextEpisodeNumber}`);
         }, item => `${item.name}<br><span class="card-ep-count">EP ${item.lastWatched} -> ${item.nextEpisodeNumber}</span>`);
      } else {
         if (container) container.parentElement.style.display = 'none';
      }
   } catch (error) {
      console.error('Error fetching continue watching:', error);
      const container = document.getElementById('continue-watching');
      if (container) container.parentElement.style.display = 'none';
   }
}
async function fetchAndDisplayWatchlist() {
   try {
      const response = await fetch('/watchlist');
      if (!response.ok) throw new Error('Network response was not ok.');
      const shows = await response.json();
      const container = document.getElementById('watchlist');
      container.innerHTML = '';
      if (shows.length === 0) {
         container.innerHTML = '<p>Your watchlist is empty.</p>';
         return;
      }
      shows.forEach(show => {
         const item = document.createElement('div');
         item.className = 'grid-item watchlist-item';
         item.innerHTML = `
            <img src="${fixThumbnailUrl(show.thumbnail)}" alt="${show.name}" loading="lazy" onerror="this.src='/placeholder.png'; this.className='image-fallback';">
            <p>${show.name}</p>
            <div class="watchlist-controls">
               <select class="status-select" data-id="${show.id}">
                  <option value="Watching" ${show.status === 'Watching' ? 'selected' : ''}>Watching</option>
                  <option value="Completed" ${show.status === 'Completed' ? 'selected' : ''}>Completed</option>
                  <option value="On-Hold" ${show.status === 'On-Hold' ? 'selected' : ''}>On-Hold</option>
                  <option value="Dropped" ${show.status === 'Dropped' ? 'selected' : ''}>Dropped</option>
                  <option value="Planned" ${show.status === 'Planned' ? 'selected' : ''}>Planned</option>
               </select>
               <button class="remove-button" data-id="${show.id}">Remove</button>
            </div>
         `;
         item.querySelector('img').addEventListener('click', () => navigateTo(`#player/${show.id}`));
         item.querySelector('.status-select').addEventListener('change', async (e) => {
            await fetch('/watchlist/status', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ id: show.id, status: e.target.value })
            });
         });
         item.querySelector('.remove-button').addEventListener('click', async () => {
            await fetch('/watchlist/remove', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ id: show.id })
            });
            item.remove();
         });
         container.appendChild(item);
      });
   } catch (error) {
      console.error('Error fetching watchlist:', error);
      document.getElementById('watchlist').innerHTML = '<p class="error">Could not load watchlist.</p>';
   }
}
function setupSearchFilters() {
   const searchInput = document.getElementById('searchInput');
   const typeFilter = document.getElementById('typeFilter');
   const seasonFilter = document.getElementById('seasonFilter');
   const yearFilter = document.getElementById('yearFilter');
   const countryFilter = document.getElementById('countryFilter');
   const translationFilter = document.getElementById('translationFilter');
   const sortFilter = document.getElementById('sortFilter');
   const searchBtn = document.getElementById('searchBtn');
   const seasons = ['ALL', 'Winter', 'Spring', 'Summer', 'Fall'];
   seasons.forEach(s => seasonFilter.add(new Option(s, s)));
   const currentYear = new Date().getFullYear();
   yearFilter.add(new Option('ALL', 'ALL'));
   for (let y = currentYear; y >= 1940; y--) {
      yearFilter.add(new Option(y, y));
   }
   searchBtn.addEventListener('click', triggerSearch);
   searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
         triggerSearch();
      }
   });
}
window.addEventListener('scroll', () => {
   if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
      if (document.getElementById('search-page').style.display === 'block' && !searchState.isLoading && searchState.hasMore) {
         performSearch(false);
      }
      if (document.getElementById('home-page').style.display === 'block' && !seasonalState.isLoading && seasonalState.hasMore) {
         fetchAndDisplaySeasonal();
      }
   }
});
function triggerSearch() {
   searchState = { page: 1, isLoading: false, hasMore: true };
   document.getElementById('results').innerHTML = '';
   performSearch(true);
}
async function performSearch(isNewSearch) {
   if (searchState.isLoading || !searchState.hasMore) return;
   searchState.isLoading = true;
   const resultsDiv = document.getElementById('results');
   if (isNewSearch) {
      resultsDiv.innerHTML = '<div class="loading"></div>';
   }
   const query = document.getElementById('searchInput').value;
   const type = document.getElementById('typeFilter').value;
   const season = document.getElementById('seasonFilter').value;
   const year = document.getElementById('yearFilter').value;
   const country = document.getElementById('countryFilter').value;
   const translation = document.getElementById('translationFilter').value;
   const sortBy = document.getElementById('sortFilter').value;
   const page = searchState.page;
   try {
      const params = new URLSearchParams({ query, type, season, year, country, translation, sortBy, page });
      const response = await fetch(`/search?${params}`);
      if (!response.ok) throw new Error('Search failed');
      const shows = await response.json();
      if (isNewSearch) {
         resultsDiv.innerHTML = '';
      }
      if (shows.length === 0) {
         searchState.hasMore = false;
         if (isNewSearch) resultsDiv.innerHTML = '<p>No results found.</p>';
         return;
      }
      displayGrid('results', shows, (show) => {
         navigateTo(`#player/${show._id}`);
      }, item => item.name, !isNewSearch);
      searchState.page++;
   } catch (error) {
      console.error('Search error:', error);
      resultsDiv.innerHTML = '<p class="error">An error occurred during search.</p>';
   } finally {
      searchState.isLoading = false;
   }
}
async function fetchEpisodes(showId, showName, showThumbnail, mode = 'sub', episodeToPlay = null) {
   const page = document.getElementById('player-page');
   page.innerHTML = '<div class="loading"></div>';
   try {
      const showMetaResponse = await fetch(`/show-meta/${showId}`);
      const showMeta = await showMetaResponse.json();
      const [episodesResponse, watchedResponse, watchlistResponse] = await Promise.all([
         fetch(`/episodes?showId=${encodeURIComponent(showId)}&mode=${mode}`),
         fetch(`/watched-episodes/${showId}`),
         fetch(`/watchlist/check/${showId}`)
      ]);
      if (!episodesResponse.ok) throw new Error('Network response was not ok');
      const { episodes, description } = await episodesResponse.json();
      const sortedEpisodes = episodes.sort((a, b) => parseFloat(a) - parseFloat(b));
      const watchedEpisodes = await watchedResponse.json();
      const { inWatchlist } = await watchlistResponse.json();
      displayEpisodes(sortedEpisodes, showId, showMeta.name, showMeta.thumbnail, watchedEpisodes, mode, description, inWatchlist);
      const epToPlay = episodeToPlay || sortedEpisodes[0];
      if (epToPlay) {
         fetchVideoLinks(showId, epToPlay, showMeta.name, showMeta.thumbnail, mode);
      }
   } catch (error) {
      console.error('Error fetching episode data:', error);
      page.innerHTML = `<p class="error">Could not load episode data.</p>`;
   }
}
function displayEpisodes(episodes, showId, showName, showThumbnail, watchedEpisodes, mode, description, inWatchlist) {
   const page = document.getElementById('player-page');
   page.innerHTML = `
      <div class="player-page-content">
         <div class="show-header">
            <h2>${showName}</h2>
            <div class="header-controls">
               <button id="watchlistToggleBtn" class="watchlist-toggle-button ${inWatchlist ? 'in-list' : ''}">
                  ${inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
               </button>
               <div class="toggle-container">
                  <span>SUB</span>
                  <label class="switch">
                     <input type="checkbox" id="modeToggle" ${mode === 'dub' ? 'checked' : ''}>
                     <span class="slider"></span>
                  </label>
                  <span>DUB</span>
               </div>
            </div>
         </div>
         <div class="show-description">${description ? description.replace(/<br>/g, ' ').replace(/\[.*?\]/g, '') : 'No description available.'}</div>
         <div id="player-section-container"></div>
         <div id="episode-grid-player" class="episode-grid">
            ${episodes.map(ep => `
               <div class="result-item ${watchedEpisodes.includes(ep.toString()) ? 'watched' : ''}" data-episode="${ep}">Episode ${ep}</div>
            `).join('') || `<p class="error">No ${mode.toUpperCase()} episodes found</p>`}
         </div>
      </div>
   `;
   page.querySelectorAll('.result-item').forEach(item => {
      item.addEventListener('click', () => fetchVideoLinks(showId, item.dataset.episode, showName, showThumbnail, mode));
   });
   document.getElementById('modeToggle').addEventListener('change', (e) => {
      fetchEpisodes(showId, showName, showThumbnail, e.target.checked ? 'dub' : 'sub');
   });
   const watchlistBtn = document.getElementById('watchlistToggleBtn');
   watchlistBtn.addEventListener('click', async () => {
      const isInList = watchlistBtn.classList.contains('in-list');
      const endpoint = isInList ? '/watchlist/remove' : '/watchlist/add';
      const body = { id: showId, name: showName, thumbnail: showThumbnail };
      const response = await fetch(endpoint, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(body)
      });
      if (response.ok) {
         watchlistBtn.classList.toggle('in-list');
         watchlistBtn.textContent = watchlistBtn.classList.contains('in-list') ? 'In Watchlist' : 'Add to Watchlist';
      }
   });
}
async function fetchVideoLinks(showId, episodeNumber, showName, showThumbnail, mode = 'sub') {
   const playerPageContent = document.querySelector('.player-page-content');
   if (!playerPageContent) return;
   const oldPlayer = document.getElementById('player-section-container');
   if (oldPlayer) oldPlayer.remove();
   const playerContainer = document.createElement('div');
   playerContainer.id = 'player-section-container';
   playerContainer.innerHTML = '<div class="loading"></div>';
   playerPageContent.insertBefore(playerContainer, document.getElementById('episode-grid-player'));
   document.querySelectorAll('#episode-grid-player .result-item').forEach(item => item.classList.remove('active'));
   const activeEpItem = document.querySelector(`#episode-grid-player .result-item[data-episode='${episodeNumber}']`);
   if (activeEpItem) activeEpItem.classList.add('active');
   try {
      const [sourcesResponse, settingsResponse] = await Promise.all([
         fetch(`/video?showId=${encodeURIComponent(showId)}&episodeNumber=${encodeURIComponent(episodeNumber)}&mode=${mode}`),
         fetch('/settings/preferredSource')
      ]);
      if (!sourcesResponse.ok) throw new Error('Failed to fetch data');
      const sources = await sourcesResponse.json();
      const { value: preferredSource } = await settingsResponse.json();
      displayEpisodePlayer(sources, showId, episodeNumber, showName, showThumbnail, preferredSource);
   } catch (error) {
      console.error('Error fetching video links:', error);
      playerContainer.innerHTML = `<p class="error">Could not load video sources.</p>`;
   }
}
function displayEpisodePlayer(sources, showId, episodeNumber, showName, showThumbnail, preferredSource) {
   const playerSection = document.getElementById('player-section-container');
   if (!playerSection) return;
   const playIcon = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
   const pauseIcon = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
   const fullscreenIcon = `<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`;
   const exitFullscreenIcon = `<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`;
   const volumeHighIcon = `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
   const volumeMuteIcon = `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
   const seekForwardIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="m19.293 8-3.147-3.146a.5.5 0 1 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 1 1-.708-.708L19.293 9H5.5A1.5 1.5 0 0 0 4 10.5v6A1.5 1.5 0 0 0 5.5 18h15a.5.5 0 0 1 0 1h-15A2.5 2.5 0 0 1 3 16.5v-6A2.5 2.5 0 0 1 5.5 8z"/><text x="6.5" y="16.25" font-size="8">10</text></svg>`;
   const seekBackwardIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="m4.707 8 3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 1 0 .708-.708L4.707 9H18.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-15a.5.5 0 0 0 0 1h15a2.5 2.5 0 0 0 2.5-2.5v-6A2.5 2.5 0 0 0 18.5 8z"/><text x="8" y="16.25" font-size="8">10</text></svg>`;
   playerSection.innerHTML = `
      <div id="player-content" class="player-content">
         <video id="videoPlayer"></video>
         <div id="video-controls-container" class="video-controls-container">
            <div class="progress-bar-container">
               <div class="progress-bar">
                  <div class="progress-bar-watched"></div>
                  <div class="progress-bar-buffered"></div>
                  <div class="progress-bar-thumb"></div>
               </div>
            </div>
            <div class="bottom-controls">
               <div class="left-controls">
                  <button id="play-pause-btn" class="control-button">${playIcon}</button>
                  <div class="volume-container">
                     <button id="volume-btn" class="control-button">${volumeHighIcon}</button>
                     <input type="range" id="volume-slider" min="0" max="1" step="0.05" value="1">
                  </div>
                  <div class="time-display">
                     <span id="current-time">00:00</span> / <span id="total-time">00:00</span>
                  </div>
               </div>
               <div class="right-controls">
                  <button id="seek-backward-btn" class="control-button seek-button">${seekBackwardIcon}</button>
                  <button id="seek-forward-btn" class="control-button seek-button">${seekForwardIcon}</button>
                  <div class="toggle-container">
                     <label for="autoplayToggle">Autoplay</label>
                     <label class="switch">
                        <input type="checkbox" id="autoplayToggle">
                        <span class="slider"></span>
                     </label>
                  </div>
                  <button id="cc-btn" class="control-button disabled"><svg viewBox="0 0 24 24"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2v-.5H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2v-.5H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/></svg></button>
                  <button id="settings-btn" class="control-button"><svg viewBox="0 0 24 24"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49 1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg></button>
                  <button id="fullscreen-btn" class="control-button">${fullscreenIcon}</button>
                  <div id="settings-menu" class="settings-menu hidden">
                     <h4>Quality</h4>
                     <div id="source-options"></div>
                  </div>
                  <div id="cc-menu" class="settings-menu cc-menu hidden">
                     <h4>Subtitles</h4>
                     <div id="cc-options-container"></div>
                     <div class="cc-divider"></div>
                     <h4>Subtitle Settings</h4>
                     <div class="cc-slider-container">
                        <label for="fontSizeSlider">Font Size</label>
                        <input type="range" id="fontSizeSlider" min="1" max="3" step="0.1" value="1.8">
                     </div>
                     <div class="cc-slider-container">
                        <label for="positionSlider">Position</label>
                        <input type="range" id="positionSlider" min="-10" max="0" step="1" value="-4">
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </div>
   `;
   initCustomPlayer(sources, showId, episodeNumber, showName, showThumbnail, preferredSource);
}

function initCustomPlayer(sources, showId, episodeNumber, showName, showThumbnail, preferredSource) {
   const playerContent = document.getElementById('player-content');
   const video = document.getElementById('videoPlayer');
   const controlsContainer = document.getElementById('video-controls-container');
   const playPauseBtn = document.getElementById('play-pause-btn');
   const seekBackwardBtn = document.getElementById('seek-backward-btn');
   const seekForwardBtn = document.getElementById('seek-forward-btn');
   const progressBar = document.querySelector('.progress-bar');
   const watchedBar = document.querySelector('.progress-bar-watched');
   const bufferedBar = document.querySelector('.progress-bar-buffered');
   const progressBarThumb = document.querySelector('.progress-bar-thumb');
   const currentTimeEl = document.getElementById('current-time');
   const totalTimeEl = document.getElementById('total-time');
   const fullscreenBtn = document.getElementById('fullscreen-btn');
   const settingsBtn = document.getElementById('settings-btn');
   const ccBtn = document.getElementById('cc-btn');
   const settingsMenu = document.getElementById('settings-menu');
   const ccMenu = document.getElementById('cc-menu');
   const sourceOptions = document.getElementById('source-options');
   const volumeBtn = document.getElementById('volume-btn');
   const volumeSlider = document.getElementById('volume-slider');
   const fontSizeSlider = document.getElementById('fontSizeSlider');
   const positionSlider = document.getElementById('positionSlider');
   const playIcon = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
   const pauseIcon = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
   const fullscreenIcon = `<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`;
   const exitFullscreenIcon = `<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`;
   const volumeHighIcon = `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
   const volumeMuteIcon = `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;
   let styleElement = document.getElementById('subtitle-style-override');
   if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'subtitle-style-override';
      document.head.appendChild(styleElement);
   }
   const updateFontSize = () => {
      const size = fontSizeSlider.value;
      styleElement.innerHTML = `video::cue { font-size: ${size}rem !important; }`;
      localStorage.setItem('subtitleFontSize', size);
   };
   const updatePosition = () => {
      const position = positionSlider.value;
      if (video.textTracks && video.textTracks.length > 0) {
         for (const track of video.textTracks) {
            if (track.cues) {
               for (const cue of track.cues) {
                  cue.line = parseInt(position, 10);
               }
            }
         }
      }
      localStorage.setItem('subtitlePosition', position);
   };
   fontSizeSlider.value = localStorage.getItem('subtitleFontSize') || '1.8';
   positionSlider.value = localStorage.getItem('subtitlePosition') || '-4';
   updateFontSize();
   fontSizeSlider.addEventListener('input', updateFontSize);
   positionSlider.addEventListener('input', updatePosition);
   const togglePlay = () => {
      if (video.paused) {
         video.play();
      } else {
         video.pause();
      }
   };
   let clickTimer = null;
   video.addEventListener('click', (e) => {
      if (clickTimer === null) {
         clickTimer = setTimeout(() => {
            clickTimer = null;
            togglePlay();
         }, 250);
      } else {
         clearTimeout(clickTimer);
         clickTimer = null;
         if (!document.fullscreenElement) {
            playerContent.requestFullscreen();
         } else {
            document.exitFullscreen();
         }
      }
   });
   playPauseBtn.addEventListener('click', togglePlay);
   video.addEventListener('play', () => playPauseBtn.innerHTML = pauseIcon);
   video.addEventListener('pause', () => playPauseBtn.innerHTML = playIcon);
   seekBackwardBtn.addEventListener('click', () => { video.currentTime -= 10; });
   seekForwardBtn.addEventListener('click', () => { video.currentTime += 10; });
   const formatTime = (timeInSeconds) => {
      const result = new Date(timeInSeconds * 1000).toISOString().substr(11, 8);
      return {
         minutes: result.substr(3, 2),
         seconds: result.substr(6, 2),
         hours: result.substr(0, 2)
      };
   };
   video.addEventListener('loadedmetadata', () => {
      totalTimeEl.textContent = formatTime(video.duration).hours === '00' ?
         `${formatTime(video.duration).minutes}:${formatTime(video.duration).seconds}` :
         `${formatTime(video.duration).hours}:${formatTime(video.duration).minutes}:${formatTime(video.duration).seconds}`;
   });
   video.addEventListener('timeupdate', () => {
      currentTimeEl.textContent = formatTime(video.currentTime).hours === '00' ?
         `${formatTime(video.currentTime).minutes}:${formatTime(video.currentTime).seconds}` :
         `${formatTime(video.currentTime).hours}:${formatTime(video.currentTime).minutes}:${formatTime(video.currentTime).seconds}`;
      const progressPercent = (video.currentTime / video.duration) * 100;
      watchedBar.style.width = `${progressPercent}%`;
      progressBarThumb.style.left = `${progressPercent}%`;
   });
   video.addEventListener('progress', () => {
      if (video.buffered.length > 0) {
         const bufferedEnd = video.buffered.end(video.buffered.length - 1);
         const bufferedPercent = (bufferedEnd / video.duration) * 100;
         bufferedBar.style.width = `${bufferedPercent}%`;
      }
   });
   progressBar.addEventListener('click', (e) => {
      const rect = progressBar.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      video.currentTime = percent * video.duration;
   });
   video.addEventListener('volumechange', () => {
      volumeSlider.value = video.volume;
      volumeBtn.innerHTML = video.volume === 0 || video.muted ? volumeMuteIcon : volumeHighIcon;
      localStorage.setItem('playerVolume', video.volume);
      localStorage.setItem('playerMuted', video.muted);
   });
   volumeSlider.addEventListener('input', (e) => {
      video.volume = e.target.value;
      video.muted = false;
   });
   volumeBtn.addEventListener('click', () => {
      video.muted = !video.muted;
   });
   const savedVolume = localStorage.getItem('playerVolume');
   const savedMuted = localStorage.getItem('playerMuted');
   if (savedVolume !== null) video.volume = parseFloat(savedVolume);
   if (savedMuted !== null) video.muted = savedMuted === 'true';
   volumeSlider.value = video.volume;
   fullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
         playerContent.requestFullscreen();
      } else {
         document.exitFullscreen();
      }
   });
   document.addEventListener('fullscreenchange', () => {
      playerContent.classList.toggle('fullscreen', !!document.fullscreenElement);
      fullscreenBtn.innerHTML = document.fullscreenElement ? exitFullscreenIcon : fullscreenIcon;
   });
   const toggleMenu = (menu) => {
      menu.classList.toggle('hidden');
   };
   settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(settingsMenu);
      ccMenu.classList.add('hidden');
   });
   ccBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(ccMenu);
      settingsMenu.classList.add('hidden');
   });
   document.addEventListener('click', () => {
      settingsMenu.classList.add('hidden');
      ccMenu.classList.add('hidden');
   });
   settingsMenu.addEventListener('click', e => e.stopPropagation());
   ccMenu.addEventListener('click', e => e.stopPropagation());
   let isMouseInsidePlayer = false;
   const hideControls = () => {
      if (video.paused) return;
      if (isMouseInsidePlayer) {
         controlsContainer.classList.add('hidden');
         document.body.style.cursor = 'none';
      }
   };
   const showControls = () => {
      controlsContainer.classList.remove('hidden');
      document.body.style.cursor = 'default';
      clearTimeout(playerInactivityTimer);
      if (!video.paused && isMouseInsidePlayer) {
         playerInactivityTimer = setTimeout(hideControls, 3000);
      }
   };
   playerContent.addEventListener('mousemove', () => {
      isMouseInsidePlayer = true;
      showControls();
   });
   playerContent.addEventListener('mouseleave', () => {
      isMouseInsidePlayer = false;
      clearTimeout(playerInactivityTimer);
      controlsContainer.classList.add('hidden');
      document.body.style.cursor = 'default';
   });
   playerContent.addEventListener('mouseenter', () => {
      isMouseInsidePlayer = true;
      showControls();
   });
   video.addEventListener('pause', () => {
      showControls();
      document.body.style.cursor = 'default';
   });
   video.addEventListener('play', () => {
      if (isMouseInsidePlayer) {
         playerInactivityTimer = setTimeout(hideControls, 3000);
      }
   });
   showControls();
   document.addEventListener('keydown', (e) => {
      if (document.getElementById('player-page').style.display !== 'block') return;
      const activeElement = document.activeElement;
      if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'SELECT') return;
      showControls();
      switch (e.key.toLowerCase()) {
         case ' ': e.preventDefault(); togglePlay(); break;
         case 'f': fullscreenBtn.click(); break;
         case 'm': volumeBtn.click(); break;
         case 'arrowright': video.currentTime += 5; break;
         case 'arrowleft': video.currentTime -= 5; break;
         case 'arrowup': video.volume = Math.min(1, video.volume + 0.05); break;
         case 'arrowdown': video.volume = Math.max(0, video.volume - 0.05); break;
      }
   });
   let autoPlayed = false;
   sources.forEach(source => {
      const container = document.createElement('div');
      container.className = 'source-container';
      const title = document.createElement('h4');
      title.textContent = source.sourceName;
      const sortedLinks = [...source.links].sort((a, b) => (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0));
      const englishSub = source.subtitles?.find(s => s.lang === 'en' || s.label === 'English');
      const qualityList = document.createElement('div');
      qualityList.className = 'quality-list';
      sortedLinks.forEach(linkInfo => {
         const qualityItem = document.createElement('button');
         qualityItem.className = 'quality-item';
         qualityItem.textContent = linkInfo.resolutionStr;
         qualityItem.onclick = () => {
            playVideo(source.sourceName, linkInfo, englishSub);
            markEpisodeWatched(showId, episodeNumber, showName, showThumbnail);
            sourceOptions.querySelectorAll('.quality-item').forEach(btn => btn.classList.remove('active'));
            qualityItem.classList.add('active');
         };
         qualityList.appendChild(qualityItem);
      });
      container.appendChild(title);
      container.appendChild(qualityList);
      sourceOptions.appendChild(container);
      if (!autoPlayed && preferredSource && source.sourceName === preferredSource && qualityList.querySelector('.quality-item')) {
         qualityList.querySelector('.quality-item').click();
         autoPlayed = true;
      }
   });
   if (!autoPlayed && sourceOptions.querySelector('.quality-item')) {
      sourceOptions.querySelector('.quality-item').click();
   }
   const autoplayToggle = document.getElementById('autoplayToggle');
   autoplayToggle.checked = localStorage.getItem('autoplayEnabled') === 'true';
   autoplayToggle.addEventListener('change', (e) => localStorage.setItem('autoplayEnabled', e.target.checked));
   video.addEventListener('ended', () => {
      if (autoplayToggle.checked) {
         const allEpItems = [...document.querySelectorAll('#episode-grid-player .result-item')];
         const currentEpItem = document.querySelector(`#episode-grid-player .result-item[data-episode='${episodeNumber}']`);
         const currentIndex = allEpItems.indexOf(currentEpItem);
         if (currentIndex > -1 && currentIndex < allEpItems.length - 1) {
            allEpItems[currentIndex + 1].click();
         }
      }
   });
   function playVideo(sourceName, linkInfo, subtitleInfo) {
      if (currentHlsInstance) {
         currentHlsInstance.destroy();
         currentHlsInstance = null;
      }
      const videoElement = document.getElementById('videoPlayer');
      const ccOptionsContainer = document.getElementById('cc-options-container');
      ccOptionsContainer.innerHTML = '';
      setPreferredSource(sourceName);
      while (videoElement.firstChild) {
         videoElement.removeChild(videoElement.firstChild);
      }
      if (subtitleInfo && subtitleInfo.src) {
         const updateActiveCCButton = (activeButton) => {
            ccOptionsContainer.querySelectorAll('.cc-item').forEach(btn => btn.classList.remove('active'));
            if (activeButton) activeButton.classList.add('active');
         };
         ccBtn.classList.remove('disabled');
         const offButton = document.createElement('button');
         offButton.className = 'cc-item';
         offButton.textContent = 'Off';
         offButton.onclick = () => {
            for (let i = 0; i < videoElement.textTracks.length; i++) {
               videoElement.textTracks[i].mode = 'hidden';
            }
            updateActiveCCButton(offButton);
         };
         const langButton = document.createElement('button');
         langButton.className = 'cc-item active';
         langButton.textContent = subtitleInfo.label || 'English';
         langButton.onclick = () => {
            for (let i = 0; i < videoElement.textTracks.length; i++) {
               videoElement.textTracks[i].mode = 'showing';
            }
            updateActiveCCButton(langButton);
         };
         ccOptionsContainer.appendChild(offButton);
         ccOptionsContainer.appendChild(langButton);
         const track = document.createElement('track');
         track.kind = 'subtitles';
         track.label = subtitleInfo.label || 'English';
         track.srclang = subtitleInfo.lang || 'en';
         track.src = `/subtitle-proxy?url=${encodeURIComponent(subtitleInfo.src)}`;
         track.default = true;
         videoElement.appendChild(track);
         videoElement.textTracks.addEventListener('addtrack', (event) => {
            const addedTrack = event.track;
            addedTrack.mode = 'showing';
            addedTrack.addEventListener('cuechange', () => {
               const position = localStorage.getItem('subtitlePosition') || '-4';
               const activeCues = addedTrack.activeCues;
               if (activeCues) {
                  for (let i = 0; i < activeCues.length; i++) {
                     activeCues[i].line = parseInt(position, 10);
                  }
               }
            });
         });
      } else {
         ccBtn.classList.add('disabled');
         const disabledButton = document.createElement('button');
         disabledButton.className = 'cc-item';
         disabledButton.textContent = 'Not Available';
         disabledButton.disabled = true;
         ccOptionsContainer.appendChild(disabledButton);
      }
      let proxiedUrl = `/proxy?url=${encodeURIComponent(linkInfo.link)}`;
      if (linkInfo.headers && linkInfo.headers.Referer) {
         proxiedUrl += `&referer=${encodeURIComponent(linkInfo.headers.Referer)}`;
      }
      if (linkInfo.hls && Hls.isSupported()) {
         const hls = new Hls();
         hls.loadSource(proxiedUrl);
         hls.attachMedia(videoElement);
         hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
               console.error('HLS fatal error:', data);
               hls.destroy();
               document.getElementById('player-section-container').innerHTML = '<p class="error">Failed to load video stream.</p>';
            }
         });
         currentHlsInstance = hls;
      } else {
         videoElement.src = proxiedUrl;
      }
      videoElement.play().catch(e => {
         console.log("Autoplay was prevented. User interaction needed.");
      });
   }
}

async function setPreferredSource(sourceName) {
   await fetch('/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'preferredSource', value: sourceName })
   });
}
function displayGrid(containerId, items, onClick, titleFn = item => item.name, append = false) {
   const container = document.getElementById(containerId);
   if (!container) return;
   if (!append) container.innerHTML = '';
   items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'grid-item';
      div.setAttribute('data-raw-thumbnail', item.thumbnail || '');
      const totalEpisodes = Math.max(item.availableEpisodesDetail?.sub?.length || 0, item.availableEpisodesDetail?.dub?.length || 0);
      const title = typeof titleFn === 'function' ? titleFn(item) : item.name;
      div.innerHTML = `
         <img src="${fixThumbnailUrl(item.thumbnail)}" alt="${item.name}" loading="lazy" onerror="this.src='/placeholder.png'; this.className='image-fallback';">
         <p>${title}</p>
         ${totalEpisodes > 0 && containerId !== 'continue-watching' ? `<span class="card-ep-count">EP ${totalEpisodes}</span>` : ''}
      `;
      div.addEventListener('click', () => onClick(item));
      container.appendChild(div);
   });
}
async function markEpisodeWatched(showId, episodeNumber, showName, showThumbnail) {
   await fetch('/watched-episode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showId, episodeNumber, showName, showThumbnail })
   });
   const epItem = document.querySelector(`#episode-grid-player .result-item[data-episode='${episodeNumber}']`);
   if (epItem) epItem.classList.add('watched');
}