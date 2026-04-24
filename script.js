/* ═══════════════════════════════════════════════════════════
   CONFIGURATION  ← Edit these values
═══════════════════════════════════════════════════════════ */

const STREAM_URL = 'https://server.radiostreaming.com.ar/8498/stream';
const CHAT_WS    = 'wss://brunito-production.up.railway.app';

const DEFAULT_SHOW_TIME = '2025-06-01T22:00:00';
let SHOW_TIME = new Date(localStorage.getItem('showTime') || DEFAULT_SHOW_TIME);

/* ═══════════════════════════════════════════════════════════
   COUNTDOWN UNIT
═══════════════════════════════════════════════════════════ */
class CountUnit {
    constructor(containerId) {
        const wrap = document.getElementById(containerId);
        this.span = document.createElement('span');
        this.span.className = 'cd-digits';
        this.span.textContent = '00';
        wrap.appendChild(this.span);
    }
    update(n) {
        this.span.textContent = String(Math.max(0, Math.floor(n))).padStart(2, '0');
    }
}

/* ═══════════════════════════════════════════════════════════
   COUNTDOWN
═══════════════════════════════════════════════════════════ */
const unitDays  = new CountUnit('fp-days');
const unitHours = new CountUnit('fp-hours');
const unitMins  = new CountUnit('fp-mins');
let countdownTimer = null;

function tick() {
    const diff = SHOW_TIME - new Date();
    if (diff <= 0) {
        unitDays.update(0); unitHours.update(0); unitMins.update(0);
        return;
    }
    const totalSecs = Math.floor(diff / 1000);
    unitDays.update(Math.floor(totalSecs / 86400));
    unitHours.update(Math.floor((totalSecs % 86400) / 3600));
    unitMins.update(Math.floor((totalSecs % 3600) / 60));
    countdownTimer = setTimeout(tick, 1000);
}

tick();

/* ═══════════════════════════════════════════════════════════
   SCREEN SWITCHING
═══════════════════════════════════════════════════════════ */
const countdownScreen = document.getElementById('countdownScreen');
const liveScreen      = document.getElementById('liveScreen');

function switchToLive() {
    clearTimeout(countdownTimer);
    countdownScreen.classList.add('fade-out');
    setTimeout(() => {
        countdownScreen.classList.add('hidden');
        countdownScreen.classList.remove('fade-out');
        liveScreen.classList.remove('hidden');
        void liveScreen.offsetWidth; // force reflow before fade-in
        liveScreen.classList.add('fade-in');
        setTimeout(() => liveScreen.classList.remove('fade-in'), 700);
        connectChat();
    }, 680);
}

document.getElementById('enterBtn').addEventListener('click', () => {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.msRequestFullscreen) el.msRequestFullscreen();
    switchToLive();
});

/* ═══════════════════════════════════════════════════════════
   AUDIO + VU METERS
═══════════════════════════════════════════════════════════ */
const player    = document.getElementById('radio-player');
const fader     = document.getElementById('volume-fader');
const vuL       = document.getElementById('vu-left');
const vuR       = document.getElementById('vu-right');
const playBtn   = document.getElementById('play-btn');
const statusLed = document.getElementById('status-led');

const VU_COUNT = 15;
let isPlaying = false;

// Build VU circles — all accent color, top dot in cyan
for (let i = 0; i < VU_COUNT; i++) {
    const color = i === VU_COUNT - 1 ? '#7CFCE1' : '#27F576';
    const l = document.createElement('div'); l.className = 'vu-circle'; l.dataset.color = color;
    const r = document.createElement('div'); r.className = 'vu-circle'; r.dataset.color = color;
    vuL.appendChild(l);
    vuR.appendChild(r);
}

player.volume = parseFloat(fader.value);
fader.addEventListener('input', () => { player.volume = parseFloat(fader.value); });

let audioCtx, analyserL, analyserR;
let lastL = 0, lastR = 0;

function initAudio() {
    if (audioCtx) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return;
    }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source   = audioCtx.createMediaElementSource(player);
    const splitter = audioCtx.createChannelSplitter(2);
    analyserL = audioCtx.createAnalyser(); analyserL.smoothingTimeConstant = 0.6;
    analyserR = audioCtx.createAnalyser(); analyserR.smoothingTimeConstant = 0.6;
    source.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);
    source.connect(audioCtx.destination);
    drawVU();
}

function drawVU() {
    if (!analyserL) return;
    const dataL = new Uint8Array(analyserL.frequencyBinCount);
    const dataR = new Uint8Array(analyserR.frequencyBinCount);
    analyserL.getByteFrequencyData(dataL);
    analyserR.getByteFrequencyData(dataR);
    const avgL = dataL.reduce((a, b) => a + b) / dataL.length;
    const avgR = dataR.reduce((a, b) => a + b) / dataR.length;
    // Smoothed lerp for natural falloff
    lastL = lastL + (avgL - lastL) * 0.35;
    lastR = lastR + (avgR - lastR) * 0.35;
    const vol    = player.volume;
    const levelL = lastL * 0.45 * Math.pow(vol, 0.7);
    const levelR = lastR * 0.45 * Math.pow(vol, 0.7);
    updateVU(vuL, isPlaying ? Math.min(Math.floor(levelL * 0.45), VU_COUNT) : 0);
    updateVU(vuR, isPlaying ? Math.min(Math.floor(levelR * 0.45), VU_COUNT) : 0);
    requestAnimationFrame(drawVU);
}

function updateVU(container, activeCount) {
    container.querySelectorAll('.vu-circle').forEach((dot, i) => {
        if (i < activeCount) {
            dot.style.background = dot.dataset.color;
            dot.style.boxShadow  = `0 0 15px ${dot.dataset.color}`;
        } else {
            dot.style.background = '#080808';
            dot.style.boxShadow  = 'none';
        }
    });
}

playBtn.addEventListener('click', () => {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else if (el.msRequestFullscreen) el.msRequestFullscreen();
    }
    initAudio();
    if (!isPlaying) {
        player.src = STREAM_URL;
        player.load();
        player.play().catch(() => {
            statusLed.className = 'led-luz-off';
            isPlaying = false;
        });
        statusLed.className = 'led-luz-on';
        isPlaying = true;
    } else {
        player.pause();
        player.src = '';
        statusLed.className = 'led-luz-off';
        isPlaying = false;
    }
});

player.addEventListener('error', () => {
    if (!isPlaying) return;
    statusLed.className = 'led-luz-off';
    isPlaying = false;
    setTimeout(() => {
        player.src = STREAM_URL;
        player.load();
        player.play().catch(() => {});
        statusLed.className = 'led-luz-on';
        isPlaying = true;
    }, 3000);
});

/* ═══════════════════════════════════════════════════════════
   WEBSOCKET CHAT
═══════════════════════════════════════════════════════════ */
const chatMessages = document.getElementById('chatMessages');
const msgInput     = document.getElementById('msgInput');
const nickInput    = document.getElementById('nickInput');
const sendBtnEl    = document.getElementById('sendBtn');
let ws = null;

function connectChat() {
    if (ws) return;
    try {
        ws = new WebSocket(CHAT_WS);

        ws.onopen = () => {
            addSystemMsg('En linea');
        };

        ws.onmessage = (e) => {
            try {
                const d = JSON.parse(e.data);
                addChatMsg(d.nick, d.text, d.time);
            } catch { /* ignore malformed */ }
        };

        ws.onclose = () => {
            ws = null;
            addSystemMsg('Chat desconectado. Reintentando en 5 s…');
            setTimeout(connectChat, 5000);
        };

        ws.onerror = () => { /* handled by onclose */ };

    } catch {
        addSystemMsg('Chat no disponible.');
    }
}

function sendMessage() {
    const text = msgInput.value.trim();
    if (!text) return;
    const nick = nickInput.value.trim() || 'Anónimo';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ nick, text, time }));
    } else {
        addSystemMsg('Sin conexión al chat.');
    }
    msgInput.value = '';
}

sendBtnEl.addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

const NICK_COLORS = [
    '#DFFF00', // yellow-green
    '#7CFCE1', // cyan
    '#FF6B6B', // coral
    '#C77DFF', // purple
    '#FFB347', // orange
    '#69FF47', // green
    '#FF85A1', // pink
    '#00E5FF', // electric blue
];

function nickColor(nick) {
    let hash = 0;
    for (let i = 0; i < nick.length; i++) hash = (hash * 31 + nick.charCodeAt(i)) | 0;
    return NICK_COLORS[Math.abs(hash) % NICK_COLORS.length];
}

function addChatMsg(nick, text, time) {
    const color = nickColor(nick);
    const div = document.createElement('div');
    div.className = 'msg';
    div.innerHTML = `<span class="nick" style="color:${color};text-shadow:0 0 8px ${color}88">${esc(nick)}</span>${esc(text)}<span class="time">${time}</span>`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMsg(text) {
    const div = document.createElement('div');
    div.className = 'msg system';
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════════════════════
   ADMIN PANEL  (shortcut: Ctrl + Shift + Z)
═══════════════════════════════════════════════════════════ */
const adminPanel     = document.getElementById('adminPanel');
const adminDateInput = document.getElementById('adminDateInput');
const adminCurrent   = document.getElementById('adminCurrent');
const adminSave      = document.getElementById('adminSave');
const adminCancel    = document.getElementById('adminCancel');

function toLocalDatetimeValue(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function openAdmin() {
    adminDateInput.value = toLocalDatetimeValue(SHOW_TIME);
    adminCurrent.textContent = 'Actual: ' + SHOW_TIME.toLocaleString();
    adminPanel.classList.remove('hidden');
    adminDateInput.focus();
}

function closeAdmin() {
    adminPanel.classList.add('hidden');
}

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        adminPanel.classList.contains('hidden') ? openAdmin() : closeAdmin();
    }
    if (e.key === 'Escape') closeAdmin();
});

adminSave.addEventListener('click', () => {
    const val = adminDateInput.value;
    if (!val) return;
    const newTime = new Date(val);
    if (isNaN(newTime)) return;
    SHOW_TIME = newTime;
    localStorage.setItem('showTime', newTime.toISOString());
    clearTimeout(countdownTimer);
    tick();
    closeAdmin();
});

adminCancel.addEventListener('click', closeAdmin);

// Close on backdrop click
adminPanel.addEventListener('click', (e) => {
    if (e.target === adminPanel) closeAdmin();
});
