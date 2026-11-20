// Overpass query for one resort's ski data. Shared by fetch.mjs (Node) and preview/ (browser).
export const overpassQuery = ({ south, west, north, east }) => {
  const b = `${south},${west},${north},${east}`;
  return `[out:json][timeout:180];
(
  way["piste:type"](${b});
  relation["piste:type"](${b});
  way["aerialway"](${b});
  node["aerialway"="station"](${b});
  way["landuse"="winter_sports"](${b});
  relation["landuse"="winter_sports"](${b});
);
out body;
>;
out skel qt;`;
};
