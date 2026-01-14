console.log("YouTube Smart Filter loaded...");

// Debug: Log what video elements we can find
function debugVideoElements() {
  const lockupElements = document.querySelectorAll('yt-lockup-view-model');
  console.log(`Debug: Found ${lockupElements.length} yt-lockup-view-model elements`);
  
  if (lockupElements.length > 0) {
    const firstTitle = lockupElements[0].querySelector('.yt-lockup-metadata-view-model__title a');
    console.log('Debug: First video title:', firstTitle?.innerText);
  }
}

// Run debug after page loads
setTimeout(debugVideoElements, 2000);

// Configuration
const CONFIG = {
  CHECK_INTERVAL: 2000, // Check for new videos every 2 seconds
  DEBOUNCE_DELAY: 500,  // Wait 500ms after last change before analyzing
};

// State management
let state = {
  currentVideoTitle: null,
  analyzedVideos: new Set(),
  relevantVideoTitles: new Set(),
  isAnalyzing: false,
};

// Get current playing video title
function getCurrentVideoTitle() {
  const metaTitle = document.querySelector('meta[name="title"]');
  const h1Title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string');
  return metaTitle?.content || h1Title?.innerText || null;
}

// Get all suggested video elements with their titles
function getSuggestedVideos() {
  const videos = [];
  
  // YouTube's new structure uses yt-lockup-view-model
  const videoElements = document.querySelectorAll('yt-lockup-view-model');
  
  videoElements.forEach(el => {
    // Find title using the new selector
    const titleElement = el.querySelector('.yt-lockup-metadata-view-model__title a');
    
    // Find thumbnail
    let thumbnailElement = el.querySelector('img');
    
    // Find link
    const linkElement = el.querySelector('a');
    
    if (titleElement) {
      let title = titleElement.innerText?.trim() || 
                  titleElement.getAttribute('title')?.trim() || 
                  titleElement.getAttribute('aria-label')?.trim();
      
      // Clean up title (remove extra text)
      if (title) {
        title = title.split(' by ')[0].trim();
        
        if (title && title !== "Not available" && title.length > 0) {
          videos.push({
            title,
            element: el,
            titleElement,
            thumbnailElement,
            linkElement,
          });
        }
      }
    }
  });
  
  console.log(`Found ${videos.length} suggested videos`);
  if (videos.length > 0) {
    console.log('Sample titles:', videos.slice(0, 3).map(v => v.title));
  }
  
  return videos;
}

// Send titles to background script for Gemini analysis
async function analyzeVideosWithGemini(currentTitle, suggestedTitles) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'ANALYZE_VIDEOS',
        currentTitle,
        suggestedTitles,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error communicating with background:', chrome.runtime.lastError);
          resolve([]);
        } else {
          resolve(response?.relevantVideos || []);
        }
      }
    );
  });
}

// Apply blur effect to non-relevant videos
function applyBlurEffect(videos, relevantTitles) {
  videos.forEach(video => {
    const isRelevant = relevantTitles.has(video.title);
    
    if (!isRelevant) {
      // Blur thumbnail
      if (video.thumbnailElement) {
        video.thumbnailElement.style.filter = 'blur(12px)';
        video.thumbnailElement.style.transition = 'filter 0.3s ease';
      }
      
      // Blur title text
      if (video.titleElement) {
        video.titleElement.style.filter = 'blur(5px)';
        video.titleElement.style.transition = 'filter 0.3s ease';
      }
      
      // Add visual indicator to the whole container
      if (video.element && !video.element.dataset.filtered) {
        video.element.style.opacity = '0.5';
        video.element.style.transition = 'opacity 0.3s ease';
        video.element.dataset.filtered = 'true';
      }
      
      // Optionally prevent clicking on blurred videos
      if (video.linkElement) {
        video.linkElement.style.pointerEvents = 'none';
      }
    } else {
      // Remove blur from relevant videos
      if (video.thumbnailElement) {
        video.thumbnailElement.style.filter = 'none';
      }
      
      if (video.titleElement) {
        video.titleElement.style.filter = 'none';
      }
      
      if (video.element) {
        video.element.style.opacity = '1';
        video.element.dataset.filtered = 'false';
      }
      
      if (video.linkElement) {
        video.linkElement.style.pointerEvents = 'auto';
      }
    }
  });
  
  console.log(`Applied filters: ${videos.length - relevantTitles.size} blurred, ${relevantTitles.size} visible`);
}

// Main analysis function
let analysisTimeout;
async function performAnalysis() {
  // Clear existing timeout
  if (analysisTimeout) {
    clearTimeout(analysisTimeout);
  }
  
  // Debounce: wait for DOM to settle
  analysisTimeout = setTimeout(async () => {
    if (state.isAnalyzing) return;
    
    const currentTitle = getCurrentVideoTitle();
    if (!currentTitle) {
      console.log('No video currently playing');
      return;
    }
    
    // Check if we need to re-analyze (new video playing)
    if (currentTitle === state.currentVideoTitle) {
      // Same video, just apply existing filters
      const videos = getSuggestedVideos();
      if (videos.length > 0 && state.relevantVideoTitles.size > 0) {
        applyBlurEffect(videos, state.relevantVideoTitles);
      }
      return;
    }
    
    console.log('New video detected:', currentTitle);
    state.currentVideoTitle = currentTitle;
    state.analyzedVideos.clear();
    state.relevantVideoTitles.clear();
    state.isAnalyzing = true;
    
    const videos = getSuggestedVideos();
    if (videos.length === 0) {
      console.log('No suggested videos found yet');
      state.isAnalyzing = false;
      return;
    }
    
    const suggestedTitles = videos.map(v => v.title);
    console.log(`Analyzing ${suggestedTitles.length} suggested videos...`);
    
    try {
      const relevantVideos = await analyzeVideosWithGemini(currentTitle, suggestedTitles);
      console.log('Relevant videos:', relevantVideos);
      
      // Store relevant titles
      state.relevantVideoTitles = new Set(relevantVideos);
      
      // Apply blur effect
      applyBlurEffect(videos, state.relevantVideoTitles);
      
      console.log(`Filtered: ${relevantVideos.length}/${suggestedTitles.length} videos are relevant`);
    } catch (error) {
      console.error('Analysis failed:', error);
    } finally {
      state.isAnalyzing = false;
    }
  }, CONFIG.DEBOUNCE_DELAY);
}

// Watch for changes in the page
const observer = new MutationObserver(() => {
  performAnalysis();
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial analysis with longer delay to ensure page is loaded
setTimeout(() => {
  performAnalysis();
}, 3000);

// Periodic check for new videos
setInterval(() => {
  const videos = getSuggestedVideos();
  if (videos.length > 0 && state.relevantVideoTitles.size > 0) {
    applyBlurEffect(videos, state.relevantVideoTitles);
  }
}, CONFIG.CHECK_INTERVAL);

console.log('YouTube Smart Filter initialized');