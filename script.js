const API_KEY = "fbrmNxzq1DSA4HYO8C6ESUmb_DDNsXz4X6xDz4MABVU";
const API_BASE_URL = "https://www.radar-flask.xyz/api";
const TIMESTAMPS_ENDPOINT = `${API_BASE_URL}/timestamps`;
const IMAGE_ENDPOINT = `${API_BASE_URL}/view`;
const RADAR_BOUNDS = [
  [14, 49],
  [28, 61]
];
const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_FRAME_DELAY_MS = 600;
const DEFAULT_OVERLAY_OPACITY = 0.65;

const appState = {
  timestamps: [],
  currentIndex: -1,
  isPlaying: false,
  playbackTimerId: null,
  playbackDelay: DEFAULT_FRAME_DELAY_MS,
  refreshTimerId: null,
  overlayOpacity: DEFAULT_OVERLAY_OPACITY,
  overlay: null,
  isLoadingFrame: false,
  latestDiscoveredTimestamp: null
};

const elements = {
  timestampSelect: document.getElementById("timestamp-select"),
  latestButton: document.getElementById("latest-button"),
  previousButton: document.getElementById("previous-button"),
  playButton: document.getElementById("play-button"),
  pauseButton: document.getElementById("pause-button"),
  nextButton: document.getElementById("next-button"),
  speedSelect: document.getElementById("speed-select"),
  opacitySlider: document.getElementById("opacity-slider"),
  opacityValue: document.getElementById("opacity-value"),
  frameCount: document.getElementById("frame-count"),
  selectedTimestamp: document.getElementById("selected-timestamp"),
  loadingStatus: document.getElementById("loading-status"),
  errorStatus: document.getElementById("error-status")
};

const map = L.map("map", {
  zoomControl: true,
  preferCanvas: true
});

L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
  subdomains: "abcd",
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);

map.fitBounds(RADAR_BOUNDS, {
  padding: [24, 24]
});

bindUIEvents();
updateControlStates();
initializeApp();

async function initializeApp() {
  setLoadingStatus("Fetching available radar frames...");
  setErrorStatus("");
  updateOverlayOpacity(DEFAULT_OVERLAY_OPACITY);

  try {
    await refreshTimestamps({ preserveSelection: false, selectLatest: true });
    startAutoRefresh();
  } catch (error) {
    handleError("Unable to initialize radar viewer.", error);
  }
}

function bindUIEvents() {
  elements.timestampSelect.addEventListener("change", async (event) => {
    const selectedTimestamp = event.target.value;
    const selectedIndex = appState.timestamps.indexOf(selectedTimestamp);

    if (selectedIndex === -1) {
      return;
    }

    stopAnimation();
    await loadFrameByIndex(selectedIndex, "Loaded selected frame.");
  });

  elements.latestButton.addEventListener("click", async () => {
    if (!appState.timestamps.length) {
      return;
    }

    stopAnimation();
    await jumpToLatestFrame();
  });

  elements.previousButton.addEventListener("click", async () => {
    await stepFrame(-1);
  });

  elements.nextButton.addEventListener("click", async () => {
    await stepFrame(1);
  });

  elements.playButton.addEventListener("click", () => {
    startAnimation();
  });

  elements.pauseButton.addEventListener("click", () => {
    stopAnimation("Animation paused.");
  });

  elements.speedSelect.addEventListener("change", (event) => {
    appState.playbackDelay = Number(event.target.value);

    if (appState.isPlaying) {
      restartAnimationLoop();
    }
  });

  elements.opacitySlider.addEventListener("input", (event) => {
    updateOverlayOpacity(Number(event.target.value));
  });
}

async function refreshTimestamps(options = {}) {
  const { preserveSelection = true, selectLatest = false } = options;
  const previousTimestamp = preserveSelection ? getCurrentTimestamp() : null;
  const wasPlaying = appState.isPlaying;

  if (!preserveSelection) {
    setControlsDisabled(true);
  }

  try {
    const timestamps = await fetchTimestamps();

    if (!timestamps.length) {
      throw new Error("The timestamps endpoint returned no frames.");
    }

    const previousLatestTimestamp = appState.timestamps[appState.timestamps.length - 1] || null;
    appState.timestamps = timestamps;
    appState.latestDiscoveredTimestamp = timestamps[timestamps.length - 1];

    populateTimestampSelector();
    updateFrameCount();

    let nextIndex = appState.currentIndex;

    if (selectLatest) {
      nextIndex = timestamps.length - 1;
    } else if (previousTimestamp && timestamps.includes(previousTimestamp)) {
      nextIndex = timestamps.indexOf(previousTimestamp);
    } else if (appState.currentIndex >= timestamps.length) {
      nextIndex = timestamps.length - 1;
    } else if (appState.currentIndex === -1) {
      nextIndex = timestamps.length - 1;
    }

    const hasNewerFrames = previousLatestTimestamp && previousLatestTimestamp !== appState.latestDiscoveredTimestamp;

    if (selectLatest || appState.currentIndex === -1) {
      await loadFrameByIndex(nextIndex, "Loaded latest frame.");
    } else {
      appState.currentIndex = nextIndex;
      syncSelectorToCurrentFrame();
      updateSelectedTimestamp();
      setLoadingStatus(
        hasNewerFrames
          ? `New frames available. Click Latest to jump from ${formatTimestampForDisplay(previousTimestamp)} to the newest frame.`
          : wasPlaying
            ? "Timestamp list refreshed. Animation continues."
            : "Timestamp list refreshed."
      );
      updateControlStates();
    }
  } catch (error) {
    handleError("Unable to refresh radar timestamps.", error);
    throw error;
  } finally {
    setControlsDisabled(false);
  }
}

async function fetchTimestamps() {
  const url = new URL(TIMESTAMPS_ENDPOINT);
  url.searchParams.set("key", API_KEY);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Timestamp request failed with status ${response.status}.`);
  }

  const data = await response.json();
  return Array.isArray(data.timestamps) ? data.timestamps : [];
}

function populateTimestampSelector() {
  elements.timestampSelect.innerHTML = "";

  appState.timestamps.forEach((timestamp) => {
    const option = document.createElement("option");
    option.value = timestamp;
    option.textContent = formatTimestampForDisplay(timestamp);
    elements.timestampSelect.appendChild(option);
  });
}

async function loadFrameByIndex(index, successMessage = "Frame loaded.") {
  if (!appState.timestamps.length) {
    return;
  }

  const safeIndex = ((index % appState.timestamps.length) + appState.timestamps.length) % appState.timestamps.length;
  const timestamp = appState.timestamps[safeIndex];

  appState.currentIndex = safeIndex;
  syncSelectorToCurrentFrame();
  updateSelectedTimestamp();
  updateControlStates();

  await loadRadarOverlay(timestamp, successMessage);
}

async function loadRadarOverlay(timestamp, successMessage) {
  appState.isLoadingFrame = true;
  setErrorStatus("");
  setLoadingStatus(`Loading radar image for ${formatTimestampForDisplay(timestamp)}...`);
  updateControlStates();

  const imageUrl = buildImageUrl(timestamp);

  try {
    await preloadImage(imageUrl);

    if (appState.overlay) {
      map.removeLayer(appState.overlay);
    }

    appState.overlay = L.imageOverlay(imageUrl, RADAR_BOUNDS, {
      opacity: appState.overlayOpacity,
      interactive: false,
      crossOrigin: true
    }).addTo(map);

    setLoadingStatus(successMessage);
  } catch (error) {
    handleError(`Unable to load radar image for ${formatTimestampForDisplay(timestamp)}.`, error);
  } finally {
    appState.isLoadingFrame = false;
    updateControlStates();
  }
}

function buildImageUrl(timestamp) {
  const url = new URL(IMAGE_ENDPOINT);
  url.searchParams.set("key", API_KEY);
  url.searchParams.set("time", timestamp);
  url.searchParams.set("t", Date.now().toString());
  return url.toString();
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Image failed to load."));
    image.src = url;
  });
}

async function stepFrame(direction) {
  if (!appState.timestamps.length || appState.isLoadingFrame) {
    return;
  }

  const wasPlaying = appState.isPlaying;

  if (wasPlaying) {
    stopAnimation();
  }

  const nextIndex = appState.currentIndex + direction;
  await loadFrameByIndex(nextIndex, "Frame updated.");

  if (wasPlaying) {
    startAnimation();
  }
}

function startAnimation() {
  if (appState.isPlaying || appState.timestamps.length < 2) {
    return;
  }

  appState.isPlaying = true;
  setLoadingStatus("Animation playing.");
  updateControlStates();
  scheduleNextAnimationFrame();
}

function stopAnimation(message = "Animation stopped.") {
  appState.isPlaying = false;

  if (appState.playbackTimerId) {
    clearTimeout(appState.playbackTimerId);
    appState.playbackTimerId = null;
  }

  setLoadingStatus(message);
  updateControlStates();
}

function restartAnimationLoop() {
  if (!appState.isPlaying) {
    return;
  }

  if (appState.playbackTimerId) {
    clearTimeout(appState.playbackTimerId);
    appState.playbackTimerId = null;
  }

  scheduleNextAnimationFrame();
}

function scheduleNextAnimationFrame() {
  appState.playbackTimerId = setTimeout(async () => {
    if (!appState.isPlaying) {
      appState.playbackTimerId = null;
      return;
    }

    if (appState.isLoadingFrame || appState.timestamps.length < 2) {
      scheduleNextAnimationFrame();
      return;
    }

    const nextIndex = (appState.currentIndex + 1) % appState.timestamps.length;
    await loadFrameByIndex(nextIndex, "Animation playing.");

    if (appState.isPlaying) {
      scheduleNextAnimationFrame();
    }
  }, appState.playbackDelay);
}

async function jumpToLatestFrame() {
  if (!appState.timestamps.length) {
    return;
  }

  const latestIndex = appState.timestamps.length - 1;
  await loadFrameByIndex(latestIndex, "Loaded latest frame.");
}

function startAutoRefresh() {
  if (appState.refreshTimerId) {
    clearInterval(appState.refreshTimerId);
  }

  appState.refreshTimerId = setInterval(async () => {
    try {
      await refreshTimestamps({ preserveSelection: true, selectLatest: false });
    } catch (error) {
      // Errors are already handled in refreshTimestamps.
    }
  }, AUTO_REFRESH_INTERVAL_MS);
}

function updateOverlayOpacity(value) {
  appState.overlayOpacity = value;
  elements.opacityValue.textContent = `${Math.round(value * 100)}%`;

  if (appState.overlay) {
    appState.overlay.setOpacity(value);
  }
}

function updateFrameCount() {
  elements.frameCount.textContent = appState.timestamps.length.toString();
}

function updateSelectedTimestamp() {
  const timestamp = getCurrentTimestamp();
  elements.selectedTimestamp.textContent = timestamp
    ? formatTimestampForDisplay(timestamp)
    : "No frame loaded";
}

function syncSelectorToCurrentFrame() {
  const timestamp = getCurrentTimestamp();
  elements.timestampSelect.value = timestamp || "";
}

function updateControlStates() {
  const hasFrames = appState.timestamps.length > 0;
  const hasMultipleFrames = appState.timestamps.length > 1;
  const busy = appState.isLoadingFrame;

  elements.timestampSelect.disabled = !hasFrames || busy;
  elements.latestButton.disabled = !hasFrames || busy;
  elements.previousButton.disabled = !hasFrames || busy;
  elements.nextButton.disabled = !hasFrames || busy;
  elements.playButton.disabled = !hasMultipleFrames || busy || appState.isPlaying;
  elements.pauseButton.disabled = !appState.isPlaying;
  elements.speedSelect.disabled = !hasMultipleFrames;
  elements.opacitySlider.disabled = !hasFrames;
}

function setControlsDisabled(disabled) {
  [
    elements.timestampSelect,
    elements.latestButton,
    elements.previousButton,
    elements.playButton,
    elements.pauseButton,
    elements.nextButton,
    elements.speedSelect,
    elements.opacitySlider
  ].forEach((element) => {
    element.disabled = disabled;
  });
}

function setLoadingStatus(message) {
  elements.loadingStatus.textContent = message;
}

function setErrorStatus(message) {
  elements.errorStatus.textContent = message;
}

function handleError(userMessage, error) {
  console.error(userMessage, error);
  const errorMessage = getFriendlyErrorMessage(userMessage, error);
  setLoadingStatus("Radar viewer is waiting for a successful request.");
  setErrorStatus(errorMessage);
  updateControlStates();
}

function getCurrentTimestamp() {
  return appState.timestamps[appState.currentIndex] || null;
}

function formatTimestampForDisplay(timestamp) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short"
  }).format(date);
}

function getFriendlyErrorMessage(userMessage, error) {
  const rawMessage = error && error.message ? error.message : "Unknown error.";

  if (rawMessage === "Failed to fetch" || error instanceof TypeError) {
    return `${userMessage} Cross-origin requests are blocked because the API is missing CORS headers. Enable Access-Control-Allow-Origin on radar-flask.xyz or use a proxy on the same origin as this site.`;
  }

  return `${userMessage} ${rawMessage}`;
}
