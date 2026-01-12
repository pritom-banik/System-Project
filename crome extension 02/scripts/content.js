console.log("Content script loaded..............");
function getYouTubeVideoTitle() {
  const metaTitle = document.querySelector('meta[name="title"]');
  return metaTitle ? metaTitle.content : null;
}

console.log("YouTube Video Title:", getYouTubeVideoTitle());


const channelName = document.querySelector(
  'ytd-channel-name a'
)?.innerText;

console.log(channelName);



//===============================

// Function to get all video titles from suggested videos

console.log('Content script loaded, waiting for videos...');

function getTitles() {
  return [...document.querySelectorAll(
    'a.yt-lockup-metadata-view-model__title span'
  )].map(el => el.innerText);
}

// Try immediately first
let titles = getTitles();
if (titles.length > 0) {
  console.log('Titles:', titles);
}

// Watch for DOM changes
const observer = new MutationObserver(() => {
  const newTitles = getTitles();
  if (newTitles.length > 0 && newTitles.length !== titles.length) {
    console.log('Videos loaded/updated:', newTitles);
    titles = newTitles;
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});


//changing the href in the attribute tag
const observer2 = new MutationObserver(() => {
  document.querySelectorAll(
    'a.yt-lockup-metadata-view-model__title'
  ).forEach(anchor => {

    // Change visible title
    const span = anchor.querySelector('span');
    if (span && span.innerText !== "Not available") {
      span.innerText = "Not available";
    }

    // Change link
    if (anchor.href !== "https://www.google.com/") {
      anchor.href = "https://www.google.com/";
    }

  });
});

observer2.observe(document.body, {
  childList: true,
  subtree: true
});

//changing the title of the suggested videos to "Not available"
const observer3 = new MutationObserver(() => {
  document.querySelectorAll(
    'a.yt-lockup-metadata-view-model__title span'
  ).forEach(span => {
    if (span.innerText !== "Not available") {
      span.innerText = "Not available";
    }
  });
});

observer3.observe(document.body, {
  childList: true,
  subtree: true
});

//blur the images of the suggested videos
const observer4 = new MutationObserver(() => {
  document.querySelectorAll(
    '.ytThumbnailViewModelImage img'
  ).forEach(img => {

    // Blur the thumbnail
    img.style.filter = 'blur(12px)';

    // Replace thumbnail image
    img.src = 'https://via.placeholder.com/320x180?text=Not+Available';

  });
});

observer4.observe(document.body, {
  childList: true,
  subtree: true
});
