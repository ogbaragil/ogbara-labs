/* Check Mate computer player: runs the search off the main thread so the board stays smooth. */
importScripts("engine.js?v=1");
self.onmessage = (e) => {
  const { id, fen, level, keys, ms } = e.data;
  let m = null;
  try { m = CM.think(fen, { level, keys, ms }); } catch (err) { m = null; }
  self.postMessage({ id, m });
};
