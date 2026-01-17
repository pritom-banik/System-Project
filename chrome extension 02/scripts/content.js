console.log("Content script loaded..............");
function getYouTubeVideoTitle() {
  const metaTitle = document.querySelector('meta[name="title"]');
  return metaTitle ? metaTitle.content : null;
}
const videoTitle = getYouTubeVideoTitle();
console.log("YouTube Video Title:", videoTitle);

const channelName = document.querySelector("ytd-channel-name a")?.innerText;

console.log(channelName);

//===============================

// Function to get all video titles from suggested videos

console.log("Content script loaded, waiting for videos...");

//================================================

// This message confirms the script is running
console.log("Script started...");

function getVideoTitles() {
  var titleElements = document.querySelectorAll(
    "a.yt-lockup-metadata-view-model__title span"
  );

  var titles = [];

  for (var i = 0; i < titleElements.length; i++) {
    titles.push(titleElements[i].innerText);
  }

  return titles;
}

var collectedTitles = [];

var observer = new MutationObserver(function () {
  var newTitles = getVideoTitles();

  for (var i = 0; i < newTitles.length; i++) {
    if (collectedTitles.length >= 20) {
      console.log("Collected 20 videos. Stopping observer.");
      observer.disconnect();
      console.log("Final titles:", collectedTitles);

      chrome.runtime.sendMessage({
        // passing msg to background.js
        type: "VIDEO_TITLES",
        title: videoTitle,
        data: collectedTitles,
      });

      return;
    }

    if (!collectedTitles.includes(newTitles[i])) {
      collectedTitles.push(newTitles[i]);
    }
  }

  console.log("Collected so far:", collectedTitles.length);
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

//changing the href in the attribute tag
// const observer2 = new MutationObserver(() => {
//   document.querySelectorAll(
//     'a.yt-lockup-metadata-view-model__title'
//   ).forEach(anchor => {

//     // Change visible title
//     const span = anchor.querySelector('span');
//     if (span && span.innerText !== "") {
//       span.innerText = "";
//     }

//     // Change link
//     if (anchor.href !== "") {
//       anchor.href = "";
//     }

//   });
// });

// observer2.observe(document.body, {
//   childList: true,
//   subtree: true
// });

//changing the title of the suggested videos to "Not available"
// const observer3 = new MutationObserver(() => {
//   document.querySelectorAll(
//     'a.yt-lockup-metadata-view-model__title span'
//   ).forEach(span => {
//     if (span.innerText !== "Not available") {
//       span.innerText = "Not available";
//     }
//   });
// });

// observer3.observe(document.body, {
//   childList: true,
//   subtree: true
// });

//blur the images of the suggested videos

//<img
 // alt=""
 // class="ytCoreImageHost ytCoreImageFillParentHeight ytCoreImageFillParentWidth ytCoreImageContentModeScaleAspectFill ytCoreImageLoaded"
  //src="https://i.ytimg.com/vi/ZEKiIwWv9nM/hqdefault.jpg?sqp=-oaymwEnCNACELwBSFryq4qpAxkIARUAAIhCGAHYAQHiAQoIGBACGAY4AUAB&amp;rs=AOn4CLBttmv67EVjGOQNujQdudyuWN5yPw"
//></img>;

const observer4 = new MutationObserver(() => {
  document.querySelectorAll(".ytThumbnailViewModelImage img").forEach((img) => {
    // Blur the thumbnail
    img.style.filter = "blur(12px)";

    // Replace thumbnail image
    img.src = "https://via.placeholder.com/320x180?text=Not+Available";
  });
});

observer4.observe(document.body, {
  childList: true,
  subtree: true,
});
