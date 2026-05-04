let liveInterval;

window.startLiveUpdates = function (callback, delay = 20000) {
  if (liveInterval) clearInterval(liveInterval);

  liveInterval = setInterval(() => {
    try {
      callback();
    } catch (e) {
      console.error('Live update error:', e);
    }
  }, delay);
};
