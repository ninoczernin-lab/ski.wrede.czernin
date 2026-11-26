// Overpass query for one resort's ski data (runs, lifts, ski area, and huts / mountain restaurants). Shared by fetch.mjs (Node) and preview/ (browser).
// `forests: true` (offline data step only) also fetches wooded areas for the pine scatter; the
// browser leaves it off and uses Mapbox's landcover instead, which keeps live loads small.
export const overpassQuery = ({ south, west, north, east }, { forests = false } = {}) => {
  const b = `${south},${west},${north},${east}`;
  const woods = forests ? `\n  way["landuse"="forest"](${b});\n  way["natural"="wood"](${b});` : '';
  return `[out:json][timeout:180];
(
  way["piste:type"](${b});
  relation["piste:type"](${b});
  way["aerialway"](${b});
  node["aerialway"="station"](${b});
  way["landuse"="winter_sports"](${b});
  relation["landuse"="winter_sports"](${b});
  node["tourism"~"^(alpine_hut|wilderness_hut)$"](${b});
  way["tourism"~"^(alpine_hut|wilderness_hut)$"](${b});
  node["amenity"~"^(restaurant|cafe|bar|pub|biergarten|fast_food)$"](${b});
  way["amenity"~"^(restaurant|cafe|bar|pub|biergarten|fast_food)$"](${b});${woods}
);
out body;
>;
out skel qt;`;
};
