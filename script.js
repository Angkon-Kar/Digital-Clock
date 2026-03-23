// ─── Constants ───────────────────────────────────────────────────────────────

const MONTHS        = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const DAYS          = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const DATES         = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const SCRAMBLE_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@!%&?';

// ─── State ────────────────────────────────────────────────────────────────────

let currentActiveDate = -1;
let animFrameId       = null;
let lastSec           = -1;
let introComplete     = false;

// Hover state
let hoverActive = false;
let hoverNX     = 0;   // −1 … +1  (normalized mouse X)
const baseAngles = { 'date-ring': 0, 'month-ring': 0, 'day-ring': 0 };

// ─── Theme ────────────────────────────────────────────────────────────────────

function getStoredTheme() {
    try { return localStorage.getItem('clock-theme') || null; } catch { return null; }
}
function setStoredTheme(t) {
    try { localStorage.setItem('clock-theme', t); } catch {}
}
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.content = theme === 'dark' ? '#0d0d0d' : '#e8e0d4';
    const icon = document.querySelector('.toggle-icon');
    if (icon) icon.textContent = theme === 'dark' ? '☀' : '☾';
}
function initTheme() {
    const s = getStoredTheme();
    applyTheme(s || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
}
function toggleTheme(e) {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    const btn  = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const cx   = rect.left + rect.width  / 2;
    const cy   = rect.top  + rect.height / 2;
    const size = Math.max(window.innerWidth, window.innerHeight) * 2.4;

    const rip = document.createElement('div');
    rip.className = `theme-ripple to-${next}`;
    rip.style.cssText = `width:${size}px;height:${size}px;left:${cx-size/2}px;top:${cy-size/2}px;`;
    document.body.appendChild(rip);

    btn.classList.add('spinning');
    btn.addEventListener('animationend', () => btn.classList.remove('spinning'), { once: true });

    setTimeout(() => { applyTheme(next); setStoredTheme(next); }, 210);
    rip.addEventListener('animationend', () => rip.remove());
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (!getStoredTheme()) applyTheme(e.matches ? 'dark' : 'light');
});

// ─── Tick marks ───────────────────────────────────────────────────────────────

function buildTicks() {
    const c = document.getElementById('ticks');
    if (!c) return;
    c.innerHTML = '';
    for (let i = 0; i < 60; i++) {
        const d = document.createElement('div');
        d.className = 'tick' + (i % 5 === 0 ? ' major' : '');
        d.style.transform = `rotate(${i * 6}deg)`;
        c.appendChild(d);
    }
}

// ─── Ring Setup ───────────────────────────────────────────────────────────────

function setupRing(id, items, activeIndex, cssColorVar, introClass) {
    const container = document.getElementById(id);
    if (!container) return;

    const total      = items.length;
    const angleStep  = 360 / total;
    const finalAngle = -activeIndex * angleStep;

    container.innerHTML = '';
    items.forEach((label, i) => {
        const el = document.createElement('div');
        el.className = 'ring-item';
        el.textContent = label;
        el.style.transform = `rotate(${i * angleStep}deg)`;
        if (i === activeIndex) {
            el.classList.add('active');
            el.style.setProperty('--active-color', `var(${cssColorVar})`);
            el.style.setProperty('--active-glow',  `0 0 14px var(${cssColorVar})`);
        }
        container.appendChild(el);
    });

    baseAngles[id] = finalAngle;

    if (introClass) {
        container.style.setProperty('--ring-final', `${finalAngle}deg`);
        container.className = `ring ${introClass}`;

        container.addEventListener('animationend', () => {
            container.style.transform = `rotate(${finalAngle}deg)`;
            container.className = 'ring settled';
            container.style.removeProperty('--ring-final');
            if (id === 'day-ring') introComplete = true;
        }, { once: true });

    } else {
        container.style.transform = `rotate(${finalAngle}deg)`;
        container.className = 'ring settled';
    }
}

function updateCalendarRings(now, withIntro) {
    const dateIdx = now.getDate() - 1;
    if (!withIntro && dateIdx === currentActiveDate) return;

    setupRing('date-ring',  DATES,  dateIdx,        '--date-active',  withIntro ? 'intro-cw'  : null);
    setupRing('month-ring', MONTHS, now.getMonth(), '--month-active', withIntro ? 'intro-ccw' : null);
    setupRing('day-ring',   DAYS,   now.getDay(),   '--day-active',   withIntro ? 'intro-cwb' : null);

    currentActiveDate = dateIdx;
}

// ─── Scramble Text ────────────────────────────────────────────────────────────

let scrambleRaf = null;

function scrambleText(target, durationMs) {
    const el = document.getElementById('digital-time');
    if (!el) return;
    if (scrambleRaf) { cancelAnimationFrame(scrambleRaf); scrambleRaf = null; }

    const t0 = performance.now();

    function frame(now) {
        const progress = Math.min((now - t0) / durationMs, 1);
        let out = '';

        for (let i = 0; i < target.length; i++) {
            const ch = target[i];
            if (ch === ' ' || ch === ':') { out += ch; continue; }
            const lockAt = i / target.length;
            out += progress >= lockAt
                ? ch
                : SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)];
        }

        el.textContent = out;

        if (progress < 1) {
            scrambleRaf = requestAnimationFrame(frame);
        } else {
            el.textContent = target;
            scrambleRaf = null;
        }
    }

    scrambleRaf = requestAnimationFrame(frame);
}

// ─── Digital Time ─────────────────────────────────────────────────────────────

function p2(n) { return String(n).padStart(2, '0'); }
function buildTimeStr(h, m, s) {
    return `${p2(h % 12 || 12)}:${p2(m)}:${p2(s)} ${h >= 12 ? 'PM' : 'AM'}`;
}
function updateDigital(h, m, s, withScramble) {
    const text = buildTimeStr(h, m, s);
    if (withScramble) {
        scrambleText(text, 950);
    } else {
        const el = document.getElementById('digital-time');
        if (el && !scrambleRaf) el.textContent = text;
    }
}

// ─── Hover Parallax ───────────────────────────────────────────────────────────

function setupHover() {
    const wrap = document.querySelector('.clock-container');
    if (!wrap) return;

    wrap.addEventListener('mouseenter', () => { hoverActive = true; });

    wrap.addEventListener('mouseleave', () => {
        hoverActive = false;
        hoverNX = 0;
        ['date-ring','month-ring','day-ring'].forEach(id => {
            const el = document.getElementById(id);
            if (!el || !el.classList.contains('settled')) return;
            el.style.transition = 'transform 0.6s cubic-bezier(0.25,0.46,0.45,0.94)';
            el.style.transform  = `rotate(${baseAngles[id]}deg)`;
        });
    });

    wrap.addEventListener('mousemove', e => {
        if (!introComplete) return;
        const r = wrap.getBoundingClientRect();
        hoverNX = ((e.clientX - r.left) / r.width - 0.5) * 2;
    });
}

function applyHoverParallax() {
    if (!hoverActive || !introComplete) return;
    const ids        = ['date-ring', 'month-ring', 'day-ring'];
    const amplitudes = [3, 5.5, 9];
    const signs      = [1, -1, 1];

    ids.forEach((id, i) => {
        const el = document.getElementById(id);
        if (!el || !el.classList.contains('settled')) return;
        const nudge = hoverNX * amplitudes[i] * signs[i];
        el.style.transition = 'transform 0.12s ease-out';
        el.style.transform  = `rotate(${baseAngles[id] + nudge}deg)`;
    });
}

// ─── Clock Hands ──────────────────────────────────────────────────────────────

function startClock() {
    const secW = document.getElementById('sec-wrapper');
    const minW = document.getElementById('min-wrapper');
    const hrW  = document.getElementById('hr-wrapper');

    function tick() {
        animFrameId = requestAnimationFrame(tick);
        const now  = new Date();
        const secs = now.getSeconds();
        const mins = now.getMinutes();
        const hrs  = now.getHours();
        const ms   = now.getMilliseconds();

        if (secs !== lastSec) {
            if (introComplete) updateCalendarRings(now, false);
            updateDigital(hrs, mins, secs, false);
            lastSec = secs;
        }

        const secAngle = (secs + ms / 1000) * 6;
        const minAngle = mins * 6 + (secs + ms / 1000) * 0.1;
        const hrAngle  = (hrs % 12) * 30 + mins * 0.5 + secs * (0.5 / 60);

        secW.style.transform = `rotate(${secAngle}deg)`;
        minW.style.transform = `rotate(${minAngle}deg)`;
        hrW.style.transform  = `rotate(${hrAngle}deg)`;

        applyHoverParallax();
    }

    tick();
}

// ─── Visibility API ───────────────────────────────────────────────────────────

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (animFrameId) cancelAnimationFrame(animFrameId);
    } else {
        lastSec = -1;
        currentActiveDate = -1;
        startClock();
    }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    buildTicks();

    document.getElementById('theme-toggle')
        ?.addEventListener('click', e => toggleTheme(e));

    const now = new Date();
    updateCalendarRings(now, true);

    // Scramble on load — tiny delay so the page finishes first paint
    setTimeout(() => {
        updateDigital(now.getHours(), now.getMinutes(), now.getSeconds(), true);
    }, 80);

    setupHover();
    startClock();
});
