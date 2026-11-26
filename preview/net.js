// Inside the iPhone app the map is served from the app bundle (skimap://) and every network request
// goes through the app's offline cache (skimap-net://): tiles, terrain, fonts and OpenStreetMap
// data that were loaded once keep working with no signal. In a normal browser nothing changes.
export const inApp = location.protocol === 'skimap:';
export const net = (url) => (inApp && typeof url === 'string' && url.startsWith('https://') ? `skimap-net://${url.slice(8)}` : url);
