console.log("Content script loaded..............");

function getYouTubeVideoTitle() {
  const metaTitle = document.querySelector('meta[name="title"]');
  return metaTitle ? metaTitle.content : null;
}
const videoTitle = getYouTubeVideoTitle();
console.log("YouTube Video Title:", videoTitle);

chrome.runtime.sendMessage({ type: "VIDEO_TITLE", title: videoTitle });


function extractVideoInfo() {
  const videos = document.querySelectorAll("yt-lockup-view-model");

  return [...videos].map((video) => {
    const titleEl = video.querySelector(
      "a.yt-lockup-metadata-view-model__title",
    );

    return {
      dom: video,
      title: titleEl ? titleEl.textContent.trim() : null,
      link: titleEl ? titleEl.href : null,
    };
  });
}

var videoInfo = [];

var observer = new MutationObserver(() => {
  const allVideoInfo = extractVideoInfo();

  allVideoInfo.forEach((element, index) => {
    if (element.title && !videoInfo.includes(element.title)) {
      videoInfo.push(element.title);
      console.log(index, "New video found:", element.title);
      chrome.runtime.sendMessage({
        type: "NEW_VIDEO",
        title: element.title
      });
    }
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});
