let currentHlsInstance = null;
let searchState = { page: 1, isLoading: false, hasMore: true };
let seasonalState = { page: 1, isLoading: false, hasMore: true };
let playerInactivityTimer = null;
let profiles = [];
let activeProfileId = null;

async function fetchWithProfile(url, options = {}) {
   if (!activeProfileId) {
      console.error("No active profile selected. Cannot make request.");
      return Promise.reject(new Error("No active profile."));
   }
   const newOptions = { ...options };
   if (!newOptions.headers) {
      newOptions.headers = {};
   }
   newOptions.headers['X-Profile-ID'] = activeProfileId;
   if (newOptions.body && typeof newOptions.body === 'string') {
      newOptions.headers['Content-Type'] = 'application/json';
   }
   return fetch(url, newOptions);
}
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
   initProfileSystem();
   setupSearchFilters();
   setupHomePage();
   setupWatchlistPage();
   window.addEventListener('hashchange', router);
});
async function initProfileSystem() {
   try {
      const response = await fetch('/api/profiles');
      if (!response.ok) throw new Error('Could not load profiles.');
      profiles = await response.json();
      if (profiles.length > 0) {
         const storedId = localStorage.getItem('activeProfileId');
         const isValidId = profiles.some(p => p.id.toString() === storedId);
         activeProfileId = isValidId ? storedId : profiles[0].id.toString();
         localStorage.setItem('activeProfileId', activeProfileId);
         populateProfileSelector();
         setupProfileEventListeners();
         document.getElementById('profile-area').style.display = 'flex';
         router();
      } else {
         console.error("No profiles found on the server.");
         alert("Error: No user profiles found. The application may not work correctly.");
      }
   } catch (error) {
      console.error("Failed to initialize profile system:", error);
      alert(`Critical Error: Could not load profile system. ${error.message}`);
   }
}
function populateProfileSelector() {
   const selector = document.getElementById('profile-selector');
   selector.innerHTML = '';
   profiles.forEach(profile => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      selector.appendChild(option);
   });
   selector.value = activeProfileId;
}
function setupProfileEventListeners() {
   document.getElementById('profile-selector').addEventListener('change', (e) => switchProfile(e.target.value));
   document.getElementById('add-profile-btn').addEventListener('click', createProfile);
   document.getElementById('rename-profile-btn').addEventListener('click', renameProfile);
   document.getElementById('delete-profile-btn').addEventListener('click', deleteProfile);
}
function switchProfile(newProfileId) {
   activeProfileId = newProfileId;
   localStorage.setItem('activeProfileId', newProfileId);
   const hash = window.location.hash || '#home';
   const [path] = hash.substring(1).split('/');
   if (path === 'home' || path === '') {
      document.getElementById('continue-watching').innerHTML = '';
      document.getElementById('continue-watching').parentElement.style.display = 'none';
   } else if (path === 'watchlist') {
      document.getElementById('watchlist').innerHTML = '';
   }
   router();
}
async function createProfile() {
   const name = prompt("Enter new profile name:");
   if (name && name.trim()) {
      try {
         const response = await fetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim() })
         });
         if (!response.ok) throw new Error((await response.json()).error || 'Failed to create profile.');
         const newProfile = await response.json();
         await initProfileSystem();
         switchProfile(newProfile.id.toString());
      } catch (error) {
         alert(`Error: ${error.message}`);
      }
   }
}
async function renameProfile() {
   const currentProfile = profiles.find(p => p.id.toString() === activeProfileId);
   if (!currentProfile) return;
   const newName = prompt("Enter new name for profile:", currentProfile.name);
   if (newName && newName.trim() && newName.trim() !== currentProfile.name) {
      try {
         const response = await fetch(`/api/profiles/${activeProfileId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim() })
         });
         if (!response.ok) throw new Error((await response.json()).error || 'Failed to rename profile.');
         await initProfileSystem();
      } catch (error) {
         alert(`Error: ${error.message}`);
      }
   }
}
async function deleteProfile() {
   if (profiles.length <= 1) {
      alert("Cannot delete the last profile.");
      return;
   }
   const currentProfile = profiles.find(p => p.id.toString() === activeProfileId);
   if (!currentProfile) return;
   if (confirm(`Are you sure you want to delete the profile "${currentProfile.name}"? All its data will be lost forever.`)) {
      try {
         const response = await fetch(`/api/profiles/${activeProfileId}`, { method: 'DELETE' });
         if (!response.ok) throw new Error((await response.json()).error || 'Failed to delete profile.');
         localStorage.removeItem('activeProfileId');
         await initProfileSystem();
      } catch (error) {
         alert(`Error: ${error.message}`);
      }
   }
}
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
         } else {
            fetchAndDisplayContinueWatching();
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
         const response = await fetchWithProfile('/import/mal-xml', {
            method: 'POST',
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
      const response = await fetchWithProfile('/continue-watching');
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

      let overlayContent = '';
      if (containerId === 'continue-watching') {
         overlayContent = `<button class="remove-from-cw-btn" title="Remove from Continue Watching">×</button>`;
      } else if (totalEpisodes > 0) {
         overlayContent = `<span class="card-ep-count">EP ${totalEpisodes}</span>`;
      }
      
      div.innerHTML = `
         <img src="${fixThumbnailUrl(item.thumbnail)}" alt="${item.name}" loading="lazy" onerror="this.src='/placeholder.png'; this.className='image-fallback';">
         <p>${title}</p>
         ${overlayContent}
      `;

      div.addEventListener('click', (e) => {
         if (e.target.classList.contains('remove-from-cw-btn')) {
            return;
         }
         onClick(item);
      });
      
      if (containerId === 'continue-watching') {
         const removeBtn = div.querySelector('.remove-from-cw-btn');
         removeBtn.addEventListener('click', async () => {
            try {
               const response = await fetchWithProfile('/continue-watching/remove', {
                  method: 'POST',
                  body: JSON.stringify({ showId: item.showId })
               });
               if (response.ok) {
                  div.remove();
                  if (container.children.length === 0) {
                     container.parentElement.style.display = 'none';
                  }
               } else {
                  alert('Failed to remove from continue watching.');
               }
            } catch (error) {
               console.error('Error removing from continue watching:', error);
               alert('An error occurred.');
            }
         });
      }

      container.appendChild(div);
   });
}

async function fetchAndDisplayWatchlist() {
   try {
      const response = await fetchWithProfile('/watchlist');
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
            await fetchWithProfile('/watchlist/status', {
               method: 'POST',
               body: JSON.stringify({ id: show.id, status: e.target.value })
            });
         });
         item.querySelector('.remove-button').addEventListener('click', async () => {
            await fetchWithProfile('/watchlist/remove', {
               method: 'POST',
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
      if (!showMetaResponse.ok) throw new Error(`Failed to fetch show metadata: ${showMetaResponse.statusText}`);
      const showMeta = await showMetaResponse.json();

      const [episodesResponse, watchedResponse, watchlistResponse] = await Promise.all([
         fetch(`/episodes?showId=${encodeURIComponent(showId)}&mode=${mode}`),
         fetchWithProfile(`/watched-episodes/${showId}`),
         fetchWithProfile(`/watchlist/check/${showId}`)
      ]);

      if (!episodesResponse.ok) throw new Error(`Failed to fetch episodes list: ${episodesResponse.statusText}`);
      if (!watchedResponse.ok) throw new Error(`Failed to fetch watched status: ${watchedResponse.statusText}`);
      if (!watchlistResponse.ok) throw new Error(`Failed to fetch watchlist status: ${watchlistResponse.statusText}`);

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
      const response = await fetchWithProfile(endpoint, {
         method: 'POST',
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
         fetchWithProfile(`/settings/preferredSource`)
      ]);
      if (!sourcesResponse.ok) throw new Error('Failed to fetch video sources');
      if (!settingsResponse.ok) throw new Error('Failed to fetch user settings');
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
   const seekForwardIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="m19.293 8-3.147-3.146a.5.5 0 1 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 1 1-.708-.708L19.293 9H5.5A1.5 1.5 0 0 0 4 10.5v6A1.5 1.5 0 0 0 5.5 18h15a.5.5 0 0 1 0 1h-15A2.5 2.5 0 0 1 3 16.5v-6A2.5 2.5 0 0 1 5.5 8z"/><text x="6.5" y="16.25" font-size="8">10</text></svg>`;
   const seekBackwardIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="m4.707 8 3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 1 0 .708-.708L4.707 9H18.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-15a.5.5 0 0 0 0 1h15a2.5 2.5 0 0 0 2.5-2.5v-6A2.5 2.5 0 0 0 18.5 8z"/><text x="8" y="16.25" font-size="8">10</text></svg>`;
   playerSection.innerHTML = `
      <div id="player-content" class="player-content">
         <video id="videoPlayer"></video>
         <div id="video-controls-container" class="video-controls-container">
            <div class="progress-bar-container">
               <div id="progress-bubble" class="slider-bubble">00:00</div>
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
                     <div class="volume-slider-container">
                        <input type="range" id="volume-slider" min="0" max="1" step="0.01" value="1">
                        <div id="volume-bubble" class="slider-bubble">100%</div>
                     </div>
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
                  <button id="settings-btn" class="control-button"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M12.785.45c1.039 0 1.932.715 2.127 1.705l.087.44c.342 1.73 2.187 2.762 3.903 2.184l.436-.147c.982-.33 2.067.062 2.587.934l.785 1.318c.52.872.326 1.98-.46 2.639l-.35.293a2.83 2.83 0 0 0 0 4.368l.35.293c.787.66.98 1.767.46 2.64l-.785 1.317c-.52.872-1.605 1.264-2.587.934l-.436-.147c-1.716-.578-3.561.454-3.903 2.184l-.087.44c-.195.99-1.088 1.705-2.127 1.705h-1.57c-1.039 0-1.932-.716-2.127-1.705L9 21.405c-.342-1.73-2.187-2.762-3.903-2.184l-.436.146c-.982.331-2.067-.06-2.587-.933l-.785-1.318a2.055 2.055 0 0 1 .46-2.639l.35-.293a2.83 2.83 0 0 0 0-4.368l-.35-.293a2.055 2.055 0 0 1-.46-2.64l.785-1.317c.52-.872 1.605-1.264 2.587-.934l.436.147C6.813 5.357 8.658 4.324 9 2.595l.087-.44C9.283 1.165 10.176.45 11.215.45zM12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6" fill="currentColor"/></svg></button>
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
                        <div class="generic-slider-wrapper">
                           <input type="range" id="fontSizeSlider" min="1" max="3" step="0.1" value="1.8">
                           <div id="fontSizeBubble" class="slider-bubble">1.8</div>
                        </div>
                     </div>
                     <div class="cc-slider-container">
                        <label for="positionSlider">Position</label>
                        <div class="generic-slider-wrapper">
                           <input type="range" id="positionSlider" min="-10" max="0" step="1" value="-4">
                           <div id="positionBubble" class="slider-bubble">-4</div>
                        </div>
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
   const progressBarContainer = document.querySelector('.progress-bar-container');
   const progressBubble = document.getElementById('progress-bubble');
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
   const volumeBubble = document.getElementById('volume-bubble');
   const fontSizeSlider = document.getElementById('fontSizeSlider');
   const fontSizeBubble = document.getElementById('fontSizeBubble');
   const positionSlider = document.getElementById('positionSlider');
   const positionBubble = document.getElementById('positionBubble');
   const playIcon = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
   const pauseIcon = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
   const fullscreenIcon = `<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`;
   const exitFullscreenIcon = `<svg viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`;
   const volumeHighIcon = `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
   const volumeMediumIcon = `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>`;
   const volumeMuteIcon = `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;

   function setupSlider(slider, bubble, valueFormatter) {
      const updateSliderUI = () => {
         const min = parseFloat(slider.min);
         const max = parseFloat(slider.max);
         const val = parseFloat(slider.value);
         const percent = ((val - min) / (max - min)) * 100;
         slider.style.setProperty('--value-percent', `${percent}%`);
         if (bubble) {
            bubble.textContent = valueFormatter ? valueFormatter(val) : val;
            const sliderWidth = slider.offsetWidth;
            const thumbPosition = (percent / 100) * (sliderWidth - 16) + 8;
            const bubbleWidth = bubble.offsetWidth;
            let left = thumbPosition - (bubbleWidth / 2);
            left = Math.max(0, Math.min(left, sliderWidth - bubbleWidth));
            bubble.style.left = `${left}px`;
         }
      };
      if (bubble) {
         const container = slider.parentElement;
         const showBubble = () => {
            updateSliderUI();
            bubble.style.opacity = '1';
         };
         const hideBubble = () => bubble.style.opacity = '0';
         slider.addEventListener('input', updateSliderUI);
         container.addEventListener('mouseenter', showBubble);
         container.addEventListener('mouseleave', hideBubble);
         slider.addEventListener('mousedown', showBubble);
         slider.addEventListener('mouseup', hideBubble);
      }
      slider.addEventListener('input', updateSliderUI);
      updateSliderUI();
   }

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
   setupSlider(fontSizeSlider, fontSizeBubble, val => val.toFixed(1));
   setupSlider(positionSlider, positionBubble, val => val.toString());
   fontSizeSlider.addEventListener('input', updateFontSize);
   positionSlider.addEventListener('input', updatePosition);
   updateFontSize();

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
      const hours = result.substr(0, 2);
      const minutes = result.substr(3, 2);
      const seconds = result.substr(6, 2);
      return hours === '00' ? `${minutes}:${seconds}` : `${hours}:${minutes}:${seconds}`;
   };
   video.addEventListener('loadedmetadata', () => {
      totalTimeEl.textContent = formatTime(video.duration);
   });
   video.addEventListener('timeupdate', () => {
      currentTimeEl.textContent = formatTime(video.currentTime);
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
   progressBarContainer.addEventListener('mousemove', e => {
      const rect = progressBar.getBoundingClientRect();
      const percent = Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1);
      const hoverTime = percent * video.duration;
      progressBubble.textContent = formatTime(hoverTime);
      const bubbleWidth = progressBubble.offsetWidth;
      const containerWidth = progressBarContainer.offsetWidth;
      let left = e.clientX - rect.left - bubbleWidth / 2;
      left = Math.max(0, Math.min(left, containerWidth - bubbleWidth));
      progressBubble.style.left = `${left}px`;
      progressBubble.style.opacity = '1';
   });
   progressBarContainer.addEventListener('mouseleave', () => {
      progressBubble.style.opacity = '0';
   });
   const updateVolumeUI = () => {
      const volume = video.muted ? 0 : video.volume;
      if (video.muted || volume === 0) {
         volumeBtn.innerHTML = volumeMuteIcon;
      } else if (volume <= 0.5) {
         volumeBtn.innerHTML = volumeMediumIcon;
      } else {
         volumeBtn.innerHTML = volumeHighIcon;
      }
   };
   video.addEventListener('volumechange', () => {
      updateVolumeUI();
      setupSlider(volumeSlider, volumeBubble, val => `${Math.round(val * 100)}%`);
      localStorage.setItem('playerVolume', video.volume);
      localStorage.setItem('playerMuted', video.muted.toString());
   });
   volumeSlider.addEventListener('input', (e) => {
      video.muted = false;
      video.volume = e.target.value;
   });
   volumeBtn.addEventListener('click', () => {
      video.muted = !video.muted;
   });
   const savedVolume = localStorage.getItem('playerVolume');
   const savedMuted = localStorage.getItem('playerMuted');
   if (savedVolume !== null) video.volume = parseFloat(savedVolume);
   if (savedMuted !== null) video.muted = savedMuted === 'true';
   setupSlider(volumeSlider, volumeBubble, val => `${Math.round(val * 100)}%`);
   updateVolumeUI();
   
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
   try {
      const response = await fetchWithProfile('/settings', {
         method: 'POST',
         body: JSON.stringify({ key: 'preferredSource', value: sourceName })
      });
      if (!response.ok) {
         console.error('Failed to set preferred source:', await response.text());
      }
   } catch (error) {
      console.error('Error setting preferred source:', error);
   }
}
async function markEpisodeWatched(showId, episodeNumber, showName, showThumbnail) {
   await fetchWithProfile('/watched-episode', {
      method: 'POST',
      body: JSON.stringify({ showId, episodeNumber, showName, showThumbnail })
   });
   const epItem = document.querySelector(`#episode-grid-player .result-item[data-episode='${episodeNumber}']`);
   if (epItem) epItem.classList.add('watched');
}