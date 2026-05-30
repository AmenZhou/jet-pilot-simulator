const EARTH_RADIUS_M = 6371000;

function toRad(d) {
  return (d * Math.PI) / 180;
}

export function computeNavTo(flight, target) {
  if (!target || !flight) return null;

  const lat1 = toRad(flight.lat);
  const lat2 = toRad(target.lat);
  const dLon = toRad(target.lon - flight.lon);
  const dLat = lat2 - lat1;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const distM = 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearingRad = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);

  let hdgErr = bearingRad - flight.heading;
  while (hdgErr > Math.PI) hdgErr -= Math.PI * 2;
  while (hdgErr < -Math.PI) hdgErr += Math.PI * 2;

  return {
    destId: target.id,
    destName: target.name || target.id,
    distKm: Math.round(distM / 1000),
    distM: Math.round(distM),
    bearingRad,
    bearingDeg: Math.round((bearingRad * 180) / Math.PI),
    hdgErrorDeg: Math.round((hdgErr * 180) / Math.PI),
    headingErrorRad: hdgErr,
    arrived: distM < 8000,
  };
}
