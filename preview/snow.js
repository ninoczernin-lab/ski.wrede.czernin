// Light blowing snow over the diorama. A 2D canvas above the map (pointer-events: none): a fixed
// world wind turned by the map bearing, so flakes drift the same way across the mountain as the
// view orbits. Three depth layers for parallax. Stops completely when hidden or switched off.

export function createSnow(canvas, { getBearing, getStrength }) {
  const g = canvas.getContext('2d');
  let flakes = [], raf = 0, last = 0, on = false, w = 0, h = 0, dpr = 1;
  const WIND_FROM = 250;                                   // westerly, slightly south: typical Alpine storms

  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const count = Math.round(Math.min(110, (w * h) / 9000));
    flakes = Array.from({ length: count }, () => spawn(Math.random() * h));
  }
  function spawn(y = -10) {
    const depth = Math.random();                           // 0 far … 1 near
    return { x: Math.random() * w, y, depth, r: 0.6 + depth * 1.8, a: 0.35 + depth * 0.5, ph: Math.random() * 6.3 };
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    const strength = getStrength();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    if (strength <= 0.01) return;
    const ang = ((WIND_FROM + 180 - getBearing()) * Math.PI) / 180;  // wind direction on screen
    const wx = Math.sin(ang), wy = -Math.cos(ang) * 0.35;
    g.fillStyle = '#ffffff';
    for (const f of flakes) {
      const speed = 14 + f.depth * 46;
      f.ph += dt * (0.8 + f.depth);
      f.x += (wx * speed + Math.sin(f.ph) * 6) * dt;
      f.y += (18 + f.depth * 34 + wy * speed) * dt;
      if (f.y > h + 10) Object.assign(f, spawn());
      if (f.x < -10) f.x += w + 20; else if (f.x > w + 10) f.x -= w + 20;
      g.globalAlpha = f.a * strength;
      g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
  function start() {
    if (on) return;
    on = true; last = performance.now(); raf = requestAnimationFrame(frame);
  }
  function stop() {
    on = false; cancelAnimationFrame(raf);
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
  }
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  resize();
  return { start, stop, get running() { return on; } };
}
