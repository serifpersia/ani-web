let currentHlsInstance = null;
const searchState = {
	query: '',
	season: 'ALL',
	year: 'ALL',
	sortBy: 'Popular',
	page: 1,
	isLoading: false,
	hasMore: true
};

document.addEventListener('DOMContentLoaded', () => {
	setupSearchFilters();
	showPage('home');
});

function stopVideoPlayback() {
	if (currentHlsInstance) {
		currentHlsInstance.destroy();
		currentHlsInstance = null;
	}
	const playerPage = document.getElementById('player-page');
	const videoElement = playerPage.querySelector('video');
	if (videoElement) {
		videoElement.pause();
	}
	playerPage.innerHTML = '';
}

function showPage(page, data = {}) {
	stopVideoPlayback();
	document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
	const pageElement = document.getElementById(`${page}-page`);
	pageElement.style.display = 'block';

	switch (page) {
		case 'home':
			loadHomePage();
			break;
		case 'watchlist':
			fetchAndDisplayWatchlist();
			break;
		case 'search':
			if (document.getElementById('results').innerHTML === '') {
				triggerSearch();
			}
			break;
		case 'player':
			if (data.showId) {
				if (data.episodeToPlay) {
					fetchEpisodes(data.showId, data.showName, data.showThumbnail, 'sub', data.episodeToPlay);
				} else {
					fetchEpisodes(data.showId, data.showName, data.showThumbnail);
				}
			}
			break;
	}
}

async function loadHomePage() {
    try {
        await Promise.all([
            fetchAndDisplaySeasonal(),
            fetchAndDisplayTop10()
        ]);
        // Load less critical sections after
        fetchAndDisplayContinueWatching();
        fetchAndDisplayLatestReleases();
    } catch (error) {
        console.error('Failed to load home page sections:', error);
    }
}

const thumbnailCache = new Map();
function fixThumbnailUrl(url) {
    if (!url) return '/placeholder.png';
    if (thumbnailCache.has(url)) return thumbnailCache.get(url);
    const absoluteUrl = url.startsWith('http') ? url : `https://allanime.day/${url.replace(/^\/*/, '')}`;
    const proxiedUrl = `/image-proxy?url=${encodeURIComponent(absoluteUrl)}`;
    thumbnailCache.set(url, proxiedUrl);
    return proxiedUrl;
}
async function fetchAndDisplaySection(endpoint, containerId) {
	try {
		const response = await fetch(endpoint);
		if (!response.ok) throw new Error(`Failed to fetch ${endpoint}`);
		const shows = await response.json();
		displayGrid(containerId, shows, (show) => {
			showPage('player', {
				showId: show._id,
				showName: show.name,
				showThumbnail: show.thumbnail
			});
		});
	} catch (error) {
		document.getElementById(containerId).innerHTML = `<p class="error">Could not load this section.</p>`;
	}
}

const fetchAndDisplayLatestReleases = () => fetchAndDisplaySection('/latest-releases', 'latest-releases');

async function fetchAndDisplayTop10() {
	try {
		const response = await fetch('/popular');
		if (!response.ok) throw new Error('Failed to fetch popular');
		const shows = await response.json();
		const container = document.getElementById('top-10-popular');
		container.innerHTML = '';
		shows.forEach((show, index) => {
			const item = document.createElement('div');
			item.className = 'top-10-item';
			item.setAttribute('data-raw-thumbnail', show.thumbnail || '');
			const totalEpisodes = Math.max(show.availableEpisodesDetail?.sub?.length || 0, show.availableEpisodesDetail?.dub?.length || 0);
			item.innerHTML = `
                <span class="rank-number">${String(index + 1).padStart(2, '0')}</span>
                <img src="${fixThumbnailUrl(show.thumbnail)}" alt="${show.name}" loading="lazy" onerror="this.src='/placeholder.png';"/>
                <div class="item-details">
                    <p class="item-title">${show.name}</p>
                    <div class="ep-counts">
                        <i class="icon-cc"></i>
                        <span>${totalEpisodes}</span>
                    </div>
                </div>
            `;
			item.addEventListener('click', () => showPage('player', {
				showId: show._id,
				showName: show.name,
				showThumbnail: show.thumbnail
			}));
			container.appendChild(item);
		});
	} catch (error) {
		document.getElementById('top-10-popular').innerHTML = `<p class="error">Could not load top 10.</p>`;
	}
}

async function fetchAndDisplaySeasonal() {
	try {
		const response = await fetch('/seasonal');
		if (!response.ok) throw new Error(`Failed to fetch /seasonal`);
		const shows = await response.json();
		const firstShowWithDesc = shows.find(s => s.description);
		if (firstShowWithDesc) {
			const desc = firstShowWithDesc.description;
			const yearMatch = desc.match(/Season: (?:Winter|Spring|Summer|Fall) (\d{4})/);
			const seasonMatch = desc.match(/Season: (Winter|Spring|Summer|Fall)/);
			if (yearMatch && seasonMatch) {
				document.getElementById('seasonal-title').textContent = `${seasonMatch[1]} ${yearMatch[1]}`;
			}
		}
		displayGrid('seasonal-anime', shows, (show) => {
			showPage('player', {
				showId: show._id,
				showName: show.name,
				showThumbnail: show.thumbnail
			});
		});
	} catch (error) {
		document.getElementById('seasonal-anime').innerHTML = `<p class="error">Could not load seasonal anime.</p>`;
	}
}

async function fetchAndDisplayContinueWatching() {
	try {
		const response = await fetch('/continue-watching');
		if (!response.ok) throw new Error('Network response was not ok');
		const shows = await response.json();
		const container = document.getElementById('continue-watching');
		if (shows.length > 0) {
			container.parentElement.style.display = 'block';
			displayGrid('continue-watching', shows, (show) => {
				showPage('player', {
					showId: show.showId,
					showName: show.name,
					showThumbnail: show.thumbnail,
					episodeToPlay: show.nextEpisodeNumber
				});
			}, show => `${show.name} - Ep ${show.nextEpisodeNumber}`);
		} else {
			container.parentElement.style.display = 'none';
		}
	} catch (error) {
		document.getElementById('continue-watching').parentElement.style.display = 'none';
	}
}

async function fetchAndDisplayWatchlist() {
	try {
		const response = await fetch('/watchlist');
		if (!response.ok) throw new Error('Network response was not ok');
		const shows = await response.json();
		const container = document.getElementById('watchlist');
		container.innerHTML = '';
		container.className = 'grid';
		if (shows.length > 0) {
			shows.forEach(show => {
				const item = document.createElement('div');
				item.className = 'grid-item';
				item.setAttribute('data-raw-thumbnail', show.thumbnail || '');
				item.innerHTML = `
          <img src="${fixThumbnailUrl(show.thumbnail)}" alt="${show.name}" loading="lazy" onerror="this.src='/placeholder.png'; this.className='image-fallback';">
          <p>${show.name}</p>
          <div class="watchlist-controls">
            <select class="status-select">
              <option value="Watching" ${show.status === 'Watching' ? 'selected' : ''}>Watching</option>
              <option value="Completed" ${show.status === 'Completed' ? 'selected' : ''}>Completed</option>
              <option value="On-Hold" ${show.status === 'On-Hold' ? 'selected' : ''}>On-Hold</option>
              <option value="Dropped" ${show.status === 'Dropped' ? 'selected' : ''}>Dropped</option>
            </select>
            <button class="remove-button">Remove</button>
          </div>
        `;
				item.querySelector('img').addEventListener('click', () => showPage('player', {
					showId: show.id,
					showName: show.name,
					showThumbnail: show.thumbnail
				}));
				item.querySelector('.status-select').addEventListener('change', async (e) => {
					await fetch('/watchlist/status', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							id: show.id,
							status: e.target.value
						})
					});
				});
				item.querySelector('.remove-button').addEventListener('click', async () => {
					await fetch('/watchlist/remove', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							id: show.id
						})
					});
					fetchAndDisplayWatchlist();
				});
				container.appendChild(item);
			});
		} else {
			container.innerHTML = '<p class="error">Your watchlist is empty.</p>';
		}
	} catch (error) {
		document.getElementById('watchlist').innerHTML = '<p class="error">Could not load watchlist.</p>';
	}
}

function setupSearchFilters() {
	const seasonFilter = document.getElementById('seasonFilter');
	const yearFilter = document.getElementById('yearFilter');
	const sortFilter = document.getElementById('sortFilter');
	const searchInput = document.getElementById('searchInput');

	const seasons = ['ALL', 'Winter', 'Spring', 'Summer', 'Fall'];
	seasons.forEach(s => seasonFilter.add(new Option(s, s)));

	const currentYear = new Date().getFullYear();
	yearFilter.add(new Option('ALL', 'ALL'));
	for (let y = currentYear; y >= 1980; y--) {
		yearFilter.add(new Option(y, y));
	}
	yearFilter.value = 'ALL';

	let debounceTimer;
	const handleFilterChange = () => {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			searchState.query = searchInput.value;
			searchState.season = seasonFilter.value;
			searchState.year = yearFilter.value;
			searchState.sortBy = sortFilter.value;
			triggerSearch();
		}, 300);
	};

	seasonFilter.addEventListener('change', handleFilterChange);
	yearFilter.addEventListener('change', handleFilterChange);
	sortFilter.addEventListener('change', handleFilterChange);
	searchInput.addEventListener('input', handleFilterChange);

	window.addEventListener('scroll', () => {
		if (document.getElementById('search-page').style.display !== 'block') return;
		if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500 && !searchState.isLoading && searchState.hasMore) {
			searchState.page++;
			performSearch(false);
		}
	});
}

function triggerSearch() {
	searchState.page = 1;
	searchState.hasMore = true;
	document.getElementById('results').innerHTML = '';
	performSearch(true);
}

async function performSearch(isNewSearch) {
	if (searchState.isLoading) return;
	searchState.isLoading = true;

	const {
		query,
		season,
		year,
		sortBy,
		page
	} = searchState;
	const resultsDiv = document.getElementById('results');
	if (isNewSearch) resultsDiv.innerHTML = '<p class="loading">Searching...</p>';

	try {
		const params = new URLSearchParams({
			query,
			season,
			year,
			sortBy,
			page
		});
		const response = await fetch(`/search?${params}`);
		if (!response.ok) throw new Error('Network response was not ok');
		const shows = await response.json();

		if (isNewSearch) resultsDiv.innerHTML = '';
		if (shows.length === 0) searchState.hasMore = false;

		displayGrid('results', shows, (show) => {
			showPage('player', {
				showId: show._id,
				showName: show.name,
				showThumbnail: show.thumbnail
			});
		}, item => item.name, !isNewSearch);

	} catch (error) {
		if (isNewSearch) resultsDiv.innerHTML = '<p class="error">Failed to fetch search results.</p>';
	} finally {
		searchState.isLoading = false;
	}
}

async function fetchEpisodes(showId, showName, showThumbnail, mode = 'sub', episodeToPlay = null) {
	const page = document.getElementById('player-page');
	page.innerHTML = '<div class="player-page-content"><p class="loading">Loading episodes...</p></div>';
	try {
		const [episodesResponse, watchedResponse, watchlistResponse] = await Promise.all([
			fetch(`/episodes?showId=${encodeURIComponent(showId)}&mode=${mode}`),
			fetch(`/watched-episodes/${showId}`),
			fetch(`/watchlist/check/${showId}`)
		]);

		if (!episodesResponse.ok) throw new Error('Network response was not ok');
		const {
			episodes,
			description
		} = await episodesResponse.json();
		const sortedEpisodes = episodes.sort((a, b) => parseFloat(a) - parseFloat(b));
		const watchedEpisodes = await watchedResponse.json();
		const {
			inWatchlist
		} = await watchlistResponse.json();
		displayEpisodes(sortedEpisodes, showId, showName, showThumbnail, watchedEpisodes, mode, description, inWatchlist);

		if (episodeToPlay) {
			fetchVideoLinks(showId, episodeToPlay, showName, showThumbnail, mode);
		}

	} catch (error) {
		page.innerHTML = '<div class="player-page-content"><p class="error">Failed to fetch episodes.</p></div>';
	}
}

function displayEpisodes(episodes, showId, showName, showThumbnail, watchedEpisodes, mode, description, inWatchlist) {
	const page = document.getElementById('player-page');
	page.innerHTML = `
      <div class="player-page-content">
        <div class="show-header">
            <h2>${showName}</h2>
            <div class="header-controls">
                <button id="watchlistToggleBtn" class="watchlist-toggle-button ${inWatchlist ? 'in-list' : ''}">${inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}</button>
                <div class="toggle-container">
                    <span>SUB</span>
                    <label class="switch"><input type="checkbox" id="modeToggle" ${mode === 'dub' ? 'checked' : ''}><span class="slider"></span></label>
                    <span>DUB</span>
                </div>
            </div>
        </div>
        <div class="show-description">${description ? description.replace(/<br>/g, ' ').replace(/\[.*?\]/g, '') : 'No description available.'}</div>
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
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				id: showId,
				name: showName,
				thumbnail: showThumbnail,
				status: 'Watching'
			})
		});
		if (response.ok) {
			watchlistBtn.classList.toggle('in-list');
			watchlistBtn.textContent = isInList ? 'Add to Watchlist' : 'In Watchlist';
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
	playerContainer.innerHTML = '<p class="loading">Finding video sources...</p>';
	playerPageContent.appendChild(playerContainer);

	try {
		const [sourcesResponse, settingsResponse] = await Promise.all([
			fetch(`/video?showId=${encodeURIComponent(showId)}&episodeNumber=${encodeURIComponent(episodeNumber)}&mode=${mode}`),
			fetch('/settings/preferredSource')
		]);
		if (!sourcesResponse.ok) throw new Error('Failed to fetch data');
		const sources = await sourcesResponse.json();
		const {
			value: preferredSource
		} = await settingsResponse.json();
		displayEpisodePlayer(sources, showId, episodeNumber, showName, showThumbnail, preferredSource);
	} catch (error) {
		playerContainer.innerHTML = `<p class="error">${error.message}</p>`;
	}
}

function displayEpisodePlayer(sources, showId, episodeNumber, showName, showThumbnail, preferredSource) {
	const playerSection = document.getElementById('player-section-container');
	if (!playerSection) return;

	playerSection.innerHTML = `
    <div class="show-header">
        <h3>Episode ${episodeNumber}</h3>
        <div class="player-controls">
            <div class="toggle-container">
                <label class="switch"><input type="checkbox" id="autoplayToggle"><span class="slider"></span></label>
                <span>Autoplay</span>
            </div>
        </div>
    </div>
    <div class="player-container">
      <div id="player-content" class="player-content">
        <video id="videoPlayer" autoplay disablePictureInPicture disableRemotePlayback></video>
        <div id="video-controls-container" class="video-controls-container">
            <div class="progress-bar-container">
                <div class="progress-bar">
                    <div class="progress-bar-buffered"></div>
                    <div class="progress-bar-watched"></div>
                    <div class="progress-bar-thumb"></div>
                </div>
            </div>
            <div class="bottom-controls">
                <div class="left-controls">
                    <button id="play-pause-btn" class="control-button"></button>
                    <div class="volume-container">
                        <button id="volume-btn" class="control-button"></button>
                        <input type="range" id="volume-slider" min="0" max="1" step="0.01" value="1">
                    </div>
                    <div class="time-display">
                        <span id="current-time">0:00</span> / <span id="total-time">0:00</span>
                    </div>
                </div>
                <div class="right-controls">
                    <button id="cc-btn" class="control-button cc-button">CC</button>
                    <button id="settings-btn" class="control-button settings-button"></button>
                    <button id="fullscreen-btn" class="control-button"></button>
                </div>
            </div>
        </div>
        <div id="settings-menu" class="settings-menu hidden">
             <h4>Source & Quality</h4>
             <div id="source-options"></div>
        </div>
        <div id="cc-menu" class="settings-menu cc-menu hidden">
            <div id="cc-options-container"></div>
            <div class="cc-divider"></div>
            <div class="cc-slider-container">
                <label for="fontSizeSlider">Font Size</label>
                <input type="range" id="fontSizeSlider" min="1.2" max="3" step="0.1">
            </div>
            <div class="cc-slider-container">
                <label for="positionSlider">Position</label>
                <input type="range" id="positionSlider" min="-18" max="-1" step="1">
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
	const progressBar = document.querySelector('.progress-bar');
	const watchedBar = document.querySelector('.progress-bar-watched');
	const bufferedBar = document.querySelector('.progress-bar-buffered');
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

	const playIcon = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8,5.14V19.14L19,12.14L8,5.14Z" /></svg>`;
	const pauseIcon = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14,19H18V5H14M6,19H10V5H6V19Z" /></svg>`;
	const fullscreenIcon = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M7,17H10V19H5V14H7V17Z" /></svg>`;
	const exitFullscreenIcon = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14,14H19V16H16V19H14V14M5,14H10V19H8V16H5V14M8,5H10V10H5V8H8V5M19,8V10H14V5H16V8H19Z" /></svg>`;
	const settingsIcon = `<svg viewBox="0 0 24 24">class="icon line-color"><circle cx="12" cy="12" r="3" style="fill:none;stroke:white;stroke-linecap:round;stroke-linejoin:round;stroke-width:2"/><path d="m19.29 9.39 1.9 1.9a1 1 0 0 1 0 1.42l-1.9 1.9a1 1 0 0 0-.29.7V18a1 1 0 0 1-1 1h-2.69a1 1 0 0 0-.7.29l-1.9 1.9a1 1 0 0 1-1.42 0l-1.9-1.9a1 1 0 0 0-.7-.29H6a1 1 0 0 1-1-1v-2.69a1 1 0 0 0-.29-.7l-1.9-1.9a1 1 0 0 1 0-1.42l1.9-1.9a1 1 0 0 0 .29-.7V6a1 1 0 0 1 1-1h2.69a1 1 0 0 0 .7-.29l1.9-1.9a1 1 0 0 1 1.42 0l1.9 1.9a1 1 0 0 0 .7.29H18a1 1 0 0 1 1 1v2.69a1 1 0 0 0 .29.7" style="fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:2"/></svg>`;
	const volumeHighIcon = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z" /></svg>`;
	const volumeMuteIcon = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,4L7,9H3V15H7L12,20V4M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M19,12C19,13.22 18.5,14.34 17.74,15.23L16.28,13.77C16.42,13.25 16.5,12.69 16.5,12C16.5,10.23 15.5,8.71 14,7.97V5.29C16.89,6.15 19,8.83 19,12M21.46,18.9L20.19,20.18L18.44,18.43L16.69,20.18L15.42,18.91L17.17,17.16L15.42,15.41L16.69,14.14L18.44,15.89L20.19,14.14L21.46,15.41L19.71,17.16L21.46,18.9Z" /></svg>`;

	playPauseBtn.innerHTML = pauseIcon;
	fullscreenBtn.innerHTML = fullscreenIcon;
	settingsBtn.innerHTML = settingsIcon;
	volumeBtn.innerHTML = volumeHighIcon;

	let styleElement = document.getElementById('subtitle-style-override');
	if (!styleElement) {
		styleElement = document.createElement('style');
		styleElement.id = 'subtitle-style-override';
		document.head.appendChild(styleElement);
	}
	const updateFontSize = () => {
		const size = fontSizeSlider.value;
		styleElement.textContent = `video::cue { font-size: ${size}vw !important; }`;
		localStorage.setItem('subtitleFontSize', size);
	};
	const updatePosition = () => {
		const position = positionSlider.value;
		if (video.textTracks.length > 0 && video.textTracks[0].mode === 'showing') {
			const track = video.textTracks[0];
			if (track.activeCues) {
				for (const cue of track.activeCues) {
					cue.line = parseInt(position, 10);
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
	playPauseBtn.addEventListener('click', togglePlay);
	video.addEventListener('click', togglePlay);
	video.addEventListener('play', () => playPauseBtn.innerHTML = pauseIcon);
	video.addEventListener('pause', () => playPauseBtn.innerHTML = playIcon);

	let lastClickTime = 0;
	const doubleClickThreshold = 300;

	video.addEventListener('click', (e) => {
		const currentTime = new Date().getTime();
		if (currentTime - lastClickTime <= doubleClickThreshold) {
			if (!document.fullscreenElement) {
				playerContent.requestFullscreen();
			} else {
				document.exitFullscreen();
			}
			e.stopPropagation();
		}
		lastClickTime = currentTime;
	}, true);

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
		const percent = (video.currentTime / video.duration) * 100;
		watchedBar.style.width = `${percent}%`;
	});
	video.addEventListener('progress', () => {
		if (video.duration > 0 && video.buffered.length > 0) {
			const bufferedEnd = video.buffered.end(video.buffered.length - 1);
			bufferedBar.style.width = `${(bufferedEnd / video.duration) * 100}%`;
		}
	});
	progressBar.addEventListener('click', (e) => {
		const rect = progressBar.getBoundingClientRect();
		const percent = (e.clientX - rect.left) / rect.width;
		video.currentTime = percent * video.duration;
	});

	let lastVolume = 1;
	video.addEventListener('volumechange', () => {
		volumeSlider.value = video.volume;
		if (video.muted || video.volume === 0) {
			volumeBtn.innerHTML = volumeMuteIcon;
			volumeSlider.value = 0;
		} else {
			volumeBtn.innerHTML = volumeHighIcon;
		}
	});
	volumeSlider.addEventListener('input', (e) => {
		video.volume = e.target.value;
		video.muted = e.target.value === '0';
	});
	volumeBtn.addEventListener('click', () => {
		if (video.muted) {
			video.muted = false;
			video.volume = lastVolume;
		} else {
			lastVolume = video.volume;
			video.muted = true;
		}
	});

	fullscreenBtn.addEventListener('click', () => {
		if (!document.fullscreenElement) {
			playerContent.requestFullscreen();
		} else {
			document.exitFullscreen();
		}
	});
	document.addEventListener('fullscreenchange', () => {
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

	let inactivityTimer;
	const hideControls = () => {
		if (video.paused) return;
		controlsContainer.classList.add('hidden');
		playerContent.style.cursor = 'none';
	};
	const showControls = () => {
		controlsContainer.classList.remove('hidden');
		playerContent.style.cursor = 'default';
		clearTimeout(inactivityTimer);
		inactivityTimer = setTimeout(hideControls, 3000);
	};
	playerContent.addEventListener('mousemove', showControls);
	playerContent.addEventListener('mouseleave', hideControls);
	video.addEventListener('pause', showControls);
	video.addEventListener('play', () => {
		inactivityTimer = setTimeout(hideControls, 3000);
	});
	showControls();

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
			qualityItem.textContent = linkInfo.resolutionStr || 'Default';
			qualityItem.onclick = () => {
				playVideo(source.sourceName, linkInfo, englishSub);
				markEpisodeWatched(showId, episodeNumber, showName, showThumbnail);
				settingsMenu.classList.add('hidden');
				sourceOptions.querySelectorAll('.quality-item').forEach(btn => btn.classList.remove('active'));
				qualityItem.classList.add('active');
			};
			qualityList.appendChild(qualityItem);
		});

		container.appendChild(title);
		container.appendChild(qualityList);
		sourceOptions.appendChild(container);

		if (preferredSource && source.sourceName === preferredSource && !autoPlayed) {
			qualityList.querySelector('.quality-item')?.click();
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
}

function playVideo(sourceName, linkInfo, subtitleInfo) {
	if (currentHlsInstance) {
		currentHlsInstance.destroy();
		currentHlsInstance = null;
	}
	if (!linkInfo || !linkInfo.link) {
		return;
	}

	const videoElement = document.getElementById('videoPlayer');
	const ccOptionsContainer = document.getElementById('cc-options-container');
	const ccBtn = document.getElementById('cc-btn');
	const fontSizeSlider = document.getElementById('fontSizeSlider');
	const positionSlider = document.getElementById('positionSlider');

	if (!videoElement || !ccOptionsContainer || !ccBtn || !fontSizeSlider || !positionSlider) return;

	setPreferredSource(sourceName);

	while (videoElement.firstChild) {
		videoElement.removeChild(videoElement.firstChild);
	}
	videoElement.crossOrigin = 'anonymous';
	ccOptionsContainer.innerHTML = '';

	const updateActiveCCButton = (activeButton) => {
		ccOptionsContainer.querySelectorAll('.cc-item').forEach(btn => btn.classList.remove('active'));
		if (activeButton) {
			activeButton.classList.add('active');
		}
	};

	if (subtitleInfo?.src) {
		ccBtn.disabled = false;
		ccBtn.classList.remove('disabled');
		fontSizeSlider.disabled = false;
		positionSlider.disabled = false;

		const offButton = document.createElement('button');
		offButton.className = 'cc-item';
		offButton.textContent = 'Off';
		offButton.onclick = () => {
			if (videoElement.textTracks[0]) videoElement.textTracks[0].mode = 'hidden';
			updateActiveCCButton(offButton);
		};

		const langButton = document.createElement('button');
		langButton.className = 'cc-item active';
		langButton.textContent = subtitleInfo.label || 'English';
		langButton.onclick = () => {
			if (videoElement.textTracks[0]) videoElement.textTracks[0].mode = 'showing';
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
		}, {
			once: true
		});

	} else {
		ccBtn.disabled = true;
		ccBtn.classList.add('disabled');
		fontSizeSlider.disabled = true;
		positionSlider.disabled = true;

		const disabledButton = document.createElement('button');
		disabledButton.className = 'cc-item active';
		disabledButton.textContent = 'Unavailable';
		disabledButton.disabled = true;
		ccOptionsContainer.appendChild(disabledButton);
	}

	let proxiedUrl = `/proxy?url=${encodeURIComponent(linkInfo.link)}`;
	if (linkInfo.headers?.Referer) {
		proxiedUrl += `&referer=${encodeURIComponent(linkInfo.headers.Referer)}`;
	}
	if (linkInfo.hls && Hls.isSupported()) {
		const hls = new Hls();
		hls.loadSource(proxiedUrl);
		hls.attachMedia(videoElement);
		hls.on(Hls.Events.ERROR, (event, data) => {});
		currentHlsInstance = hls;
	} else {
		videoElement.src = proxiedUrl;
		videoElement.play().catch(e => {});
	}
	
    hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
            hls.destroy();
            currentHlsInstance = null;
            document.getElementById('player-section-container').innerHTML = '<p class="error">Failed to load video stream.</p>';
        }
    });
}

async function setPreferredSource(sourceName) {
	try {
		await fetch('/settings', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				key: 'preferredSource',
				value: sourceName
			}),
		});
	} catch (error) {}
}

function displayGrid(containerId, items, onClick, titleFn = item => item.name, append = false) {
	const container = document.getElementById(containerId);
	if (!append) container.innerHTML = '';
	if (items.length > 0) {
		items.forEach(item => {
			const div = document.createElement('div');
			div.className = 'grid-item';
			div.setAttribute('data-raw-thumbnail', item.thumbnail || '');
			const totalEpisodes = Math.max(item.availableEpisodesDetail?.sub?.length || 0, item.availableEpisodesDetail?.dub?.length || 0);
			div.innerHTML = `
        <div class="card-ep-count"><i class="icon-cc"></i> ${totalEpisodes}</div>
        <img src="${fixThumbnailUrl(item.thumbnail)}" alt="${titleFn(item)}" loading="lazy" onerror="this.src='/placeholder.png'; this.className='image-fallback';">
        <p>${titleFn(item)}</p>
      `;
			div.addEventListener('click', () => onClick(item));
			container.appendChild(div);
		});
	} else if (!append) {
		container.innerHTML = '<p class="error">No items found.</p>';
	}
}

async function markEpisodeWatched(showId, episodeNumber, showName, showThumbnail) {
	try {
		await fetch('/watched-episode', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				showId,
				episodeNumber,
				showName,
				showThumbnail
			})
		});
		const epItem = document.querySelector(`#episode-grid-player .result-item[data-episode='${episodeNumber}']`);
		if (epItem) epItem.classList.add('watched');
	} catch (error) {}
}