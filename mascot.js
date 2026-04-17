/* ========================================================================
   Claude mascot · pixel NPC that hops around the viewport.
   No mouse tracking. No gliding. Every movement is a small parabolic hop
   so it behaves like a real pixel-game creature — walk = chain of hops,
   occasional big jumps onto interactive elements, blinks, brief rests.
   ======================================================================== */
(function () {
  'use strict';

  if (window.__claudeMascotLoaded) return;
  window.__claudeMascotLoaded = true;

  const BODY = '#d97854';
  const EYE = '#0b0b0b';

  const SVG_OPEN = `
    <svg class="m-layer m-open" viewBox="0 0 100 82" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
      <rect x="10" y="4"  width="80" height="40" fill="${BODY}"/>
      <rect x="0"  y="26" width="10" height="10" fill="${BODY}"/>
      <rect x="90" y="26" width="10" height="10" fill="${BODY}"/>
      <rect x="14" y="44" width="72" height="12" fill="${BODY}"/>
      <rect x="18" y="56" width="6"  height="16" fill="${BODY}"/>
      <rect x="28" y="56" width="6"  height="16" fill="${BODY}"/>
      <rect x="66" y="56" width="6"  height="16" fill="${BODY}"/>
      <rect x="76" y="56" width="6"  height="16" fill="${BODY}"/>
      <rect x="30" y="14" width="6"  height="16" fill="${EYE}"/>
      <rect x="64" y="14" width="6"  height="16" fill="${EYE}"/>
    </svg>`;

  const SVG_CLOSED = `
    <svg class="m-layer m-closed" viewBox="0 0 100 82" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
      <rect x="10" y="4"  width="80" height="40" fill="${BODY}"/>
      <rect x="0"  y="26" width="10" height="10" fill="${BODY}"/>
      <rect x="90" y="26" width="10" height="10" fill="${BODY}"/>
      <rect x="14" y="44" width="72" height="12" fill="${BODY}"/>
      <rect x="18" y="56" width="6"  height="16" fill="${BODY}"/>
      <rect x="28" y="56" width="6"  height="16" fill="${BODY}"/>
      <rect x="66" y="56" width="6"  height="16" fill="${BODY}"/>
      <rect x="76" y="56" width="6"  height="16" fill="${BODY}"/>
      <polyline points="28,15 39,22 28,29" stroke="${EYE}" stroke-width="3" fill="none" stroke-linecap="square" stroke-linejoin="miter"/>
      <polyline points="72,15 61,22 72,29" stroke="${EYE}" stroke-width="3" fill="none" stroke-linecap="square" stroke-linejoin="miter"/>
    </svg>`;

  const css = `
  .mascot-wrap {
    position: fixed; top: 0; left: 0;
    width: 68px; height: 56px;
    pointer-events: auto; cursor: pointer; z-index: 9999;
    will-change: transform;
    transform: translate3d(-200px, -200px, 0);
  }
  .mascot-body {
    position: relative; width: 100%; height: 100%;
    will-change: transform;
    transform-origin: 50% 100%;
    filter: drop-shadow(0 8px 12px rgba(0,0,0,0.45)) drop-shadow(0 0 18px rgba(255, 106, 31, 0.25));
  }
  .m-layer {
    position: absolute; inset: 0; width: 100%; height: 100%;
    transition: opacity 0.06s linear;
  }
  .m-closed { opacity: 0; }
  .mascot-wrap.blink .m-closed { opacity: 1; }
  .mascot-wrap.blink .m-open   { opacity: 0; }

  .mascot-shadow {
    position: fixed; top: 0; left: 0;
    width: 54px; height: 10px; border-radius: 50%;
    background: radial-gradient(ellipse at center, rgba(0,0,0,0.6), rgba(0,0,0,0) 70%);
    pointer-events: none; z-index: 9998;
    will-change: transform, opacity;
    transform: translate3d(-200px, -200px, 0);
    opacity: 0;
  }

  @media (max-width: 720px) {
    .mascot-wrap, .mascot-shadow { display: none; }
  }
  `;
  const styleTag = document.createElement('style');
  styleTag.textContent = css;
  document.head.appendChild(styleTag);

  // --- Build DOM ---
  const shadow = document.createElement('div');
  shadow.className = 'mascot-shadow';
  const wrap = document.createElement('div');
  wrap.className = 'mascot-wrap';
  const body = document.createElement('div');
  body.className = 'mascot-body';
  body.innerHTML = SVG_OPEN + SVG_CLOSED;
  wrap.appendChild(body);

  function mount() {
    document.body.appendChild(shadow);
    document.body.appendChild(wrap);

    // --- Interactions ---
    wrap.addEventListener('mouseenter', () => {
      s.hovered = true;
    });
    wrap.addEventListener('mouseleave', () => {
      s.hovered = false;
    });
    wrap.addEventListener('click', () => {
      s.hurt = true;
      s.hurtStart = performance.now();
      // Freeze whatever movement he was doing; resume into idle after the ouch
      s.mode = 'idle';
      s.idleStart = s.hurtStart + 900;
      s.idleUntil = s.idleStart + 700;
      s.idleLookFlipAt = s.idleStart + 1200;
    });
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  // ----------- State -----------
  const s = {
    x: window.innerWidth / 2,
    y: window.innerHeight * 0.65,
    tx: window.innerWidth / 2,
    ty: window.innerHeight * 0.65,
    facing: 1,
    mode: 'idle',              // 'idle' | 'hop' | 'jump'
    hopStart: 0,
    hopDur: 0,
    hopArc: 0,
    hopFromX: 0, hopFromY: 0,
    hopToX: 0,   hopToY: 0,
    squash: 1,
    idleUntil: 0,
    idleStart: 0,
    idleLookFlipAt: 0,
    onElement: false,
    hovered: false,
    hurt: false,
    hurtStart: 0,
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  // ----------- Targets -----------
  // Viewport-space walk target (because mascot is position:fixed).
  // Retry until we pick somewhere meaningfully far, so each trip is clearly
  // "a walk of several hops" rather than one hop + long stop.
  function pickWalkTarget() {
    let tx, ty, dist, tries = 0;
    do {
      tx = clamp(rand(60, window.innerWidth - 60),  40, window.innerWidth - 40);
      ty = clamp(rand(110, window.innerHeight - 80), 80, window.innerHeight - 60);
      dist = Math.hypot(tx - s.x, ty - s.y);
      tries++;
    } while (dist < 180 && tries < 10);
    s.tx = tx;
    s.ty = ty;
    s.onElement = false;
  }

  function getVisibleInteractiveRects() {
    const selectors = [
      '.btn', '.option', '.faq-item', '.step', '.price-cell',
      '.summary-cell', '.btn-wa', '.seal', '.eyebrow',
      '.terminal', '.final-cta', '.input-field'
    ];
    const rects = [];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top > 80 && r.bottom < window.innerHeight - 20 && r.width > 60) {
          rects.push(r);
        }
      });
    }
    return rects;
  }

  function startBigJumpOntoElement() {
    const rects = getVisibleInteractiveRects();
    if (!rects.length) { pickWalkTarget(); startHop(); return; }
    const r = rects[Math.floor(Math.random() * rects.length)];
    const toX = clamp(r.left + Math.random() * r.width, 40, window.innerWidth - 40);
    const toY = clamp(r.top - 14, 70, window.innerHeight - 40);
    const dist = Math.hypot(toX - s.x, toY - s.y);
    s.mode = 'jump';
    s.hopStart = performance.now();
    s.hopDur = 520 + dist * 0.3;
    s.hopFromX = s.x; s.hopFromY = s.y;
    s.hopToX = toX;   s.hopToY = toY;
    s.hopArc = Math.min(150, 70 + dist * 0.22);
    const dx = toX - s.x;
    if (Math.abs(dx) > 4) s.facing = dx > 0 ? 1 : -1;
    s.onElement = true;
  }

  // Break the full distance to the walk target into a single small hop.
  // Called repeatedly until the target is reached.
  function startHop() {
    const dx = s.tx - s.x;
    const dy = s.ty - s.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 6) {
      // Arrived — long idle rest so it *stays put* for a while.
      s.mode = 'idle';
      s.idleStart = performance.now();
      s.idleUntil = s.idleStart + rand(2800, 5200);
      s.idleLookFlipAt = s.idleStart + rand(900, 1800);
      return;
    }

    const hopStep = Math.min(dist, rand(75, 115));
    const ratio = hopStep / dist;
    const toX = s.x + dx * ratio;
    const toY = s.y + dy * ratio;

    s.mode = 'hop';
    s.hopStart = performance.now();
    s.hopDur = 180;
    s.hopFromX = s.x; s.hopFromY = s.y;
    s.hopToX = toX;   s.hopToY = toY;
    s.hopArc = rand(22, 34);
    if (Math.abs(dx) > 2) s.facing = dx > 0 ? 1 : -1;
  }

  // ----------- Scroll handling -----------
  // When the user scrolls, the currently visible section changed. Pick a
  // fresh target inside the new viewport (but finish the current hop first).
  let scrollTimer = null;
  window.addEventListener('scroll', () => {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      // Pull the mascot back onto screen if it's now off it
      if (s.y > window.innerHeight - 40 || s.y < 40) {
        s.y = clamp(s.y, 100, window.innerHeight - 80);
      }
      pickWalkTarget();
      // if currently idle, start hopping right away
      if (s.mode === 'idle') startHop();
    }, 140);
  }, { passive: true });

  // ----------- Blink -----------
  function blinkOnce() {
    wrap.classList.add('blink');
    setTimeout(() => wrap.classList.remove('blink'), 130);
  }
  function scheduleBlink() {
    const next = rand(1800, 4200);
    setTimeout(() => {
      blinkOnce();
      if (Math.random() < 0.3) setTimeout(blinkOnce, 260);
      scheduleBlink();
    }, next);
  }
  scheduleBlink();

  // ----------- Action decisions (when idle period ends) -----------
  function decideNext() {
    const dx = s.tx - s.x;
    const dy = s.ty - s.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 6) {
      // Keep walking toward current target.
      startHop();
      return;
    }

    // Arrived at target — pick what to do next.
    const r = Math.random();
    if (r < 0.18) {
      startBigJumpOntoElement();
    } else {
      pickWalkTarget();
      startHop();
    }
  }

  pickWalkTarget();
  startHop();

  // ----------- Frame loop -----------
  const HURT_DUR = 850;

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 16.67, 2.2);
    last = now;

    // --- Hurt reaction (click) ----------------------------------------
    // Eyes closed, body shakes & quivers at current position, no movement.
    if (s.hurt) {
      const ht = (now - s.hurtStart) / HURT_DUR;
      if (ht >= 1) {
        s.hurt = false;
      } else {
        const damp = 1 - ht;                                   // fades out
        const shakeX = Math.sin(ht * 42) * 5 * damp;
        const shakeRot = Math.sin(ht * 46 + 1) * 8 * damp;
        const shakeSq = 0.92 + Math.sin(ht * 30) * 0.05 * damp;
        wrap.style.transform = `translate3d(${s.x - 34 + shakeX}px, ${s.y - 46}px, 0)`;
        body.style.transform = `scaleX(${s.facing}) scaleY(${shakeSq}) rotate(${shakeRot}deg)`;
        wrap.classList.add('blink');                           // eyes closed
        shadow.style.transform = `translate3d(${s.x - 27 + shakeX * 0.3}px, ${s.y + 6}px, 0) scale(1)`;
        shadow.style.opacity = 0.55;
        requestAnimationFrame(frame);
        return;
      }
    }

    // --- Hover freeze (mouse over mascot) ------------------------------
    // Stays put, just breathes + blinks normally. No hops while hovered.
    if (s.hovered) {
      const idleT = (now - (s.idleStart || now)) / 1000;
      const sq = 1 + Math.sin(idleT * 2.2) * 0.028;
      wrap.style.transform = `translate3d(${s.x - 34}px, ${s.y - 46}px, 0)`;
      body.style.transform = `scaleX(${s.facing}) scaleY(${sq})`;
      shadow.style.transform = `translate3d(${s.x - 27}px, ${s.y + 6}px, 0) scale(1)`;
      shadow.style.opacity = 0.5;
      requestAnimationFrame(frame);
      return;
    }

    if (s.mode === 'hop' || s.mode === 'jump') {
      const t = Math.min((now - s.hopStart) / s.hopDur, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      s.x = lerp(s.hopFromX, s.hopToX, eased);
      s.y = lerp(s.hopFromY, s.hopToY, eased) - Math.sin(t * Math.PI) * s.hopArc;

      // Squash/stretch: crouch before jump, stretch mid-air, squish on landing.
      if (t < 0.15)      s.squash = 1 + (t / 0.15) * 0.20;            // crouch
      else if (t > 0.85) s.squash = 1 - ((t - 0.85) / 0.15) * 0.26;  // land squish
      else {
        const mid = (t - 0.15) / 0.70;
        s.squash = 1 - Math.sin(mid * Math.PI) * 0.08;               // stretched
      }

      if (t >= 1) {
        const wasBigJump = s.mode === 'jump';
        s.x = s.hopToX;
        s.y = s.hopToY;
        s.mode = 'idle';
        s.idleStart = now;

        // Did this hop reach the walk target? If so, this is the LAST hop of
        // the trip → take a long rest (he just arrived, should stop moving).
        // If not, it's a mid-trip hop → short pause, then hop again.
        const distToTarget = Math.hypot(s.tx - s.x, s.ty - s.y);
        const arrived = wasBigJump || distToTarget < 12;

        const restTime = arrived ? rand(3500, 6000) : rand(70, 130);
        s.idleUntil = now + restTime;
        s.idleLookFlipAt = now + rand(900, 1600);
      }
    } else if (s.mode === 'idle') {
      // Subtle breathing — gentle squash oscillation so it never looks frozen.
      const idleT = (now - s.idleStart) / 1000;
      s.squash = 1 + Math.sin(idleT * 2.2) * 0.025;

      // Occasional "look around": flip facing direction during a long idle.
      if (now >= s.idleLookFlipAt) {
        s.facing = -s.facing;
        s.idleLookFlipAt = now + rand(1200, 2200);
      }

      if (now >= s.idleUntil) decideNext();
    }

    // Render
    const rx = s.x - 34;
    const ry = s.y - 46; // feet at y → body top = y - ~56
    wrap.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    body.style.transform = `scaleX(${s.facing}) scaleY(${s.squash})`;

    // Shadow — anchored to landing point (ground line under mascot).
    const groundY = (s.mode === 'hop' || s.mode === 'jump')
      ? lerp(s.hopFromY, s.hopToY, Math.min((now - s.hopStart) / s.hopDur, 1))
      : s.y;
    const airT = (s.mode === 'hop' || s.mode === 'jump')
      ? Math.sin(Math.min((now - s.hopStart) / s.hopDur, 1) * Math.PI)
      : 0;
    const shOp = 0.55 * (1 - airT * 0.7);
    const shSc = 1 - airT * 0.35;
    shadow.style.transform = `translate3d(${s.x - 27}px, ${groundY + 6}px, 0) scale(${shSc})`;
    shadow.style.opacity = shOp;

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener('resize', () => {
    s.x  = clamp(s.x,  40, window.innerWidth - 40);
    s.y  = clamp(s.y,  80, window.innerHeight - 60);
    s.tx = clamp(s.tx, 40, window.innerWidth - 40);
    s.ty = clamp(s.ty, 80, window.innerHeight - 60);
  });
})();
