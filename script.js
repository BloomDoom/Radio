/* ═══════════════════════════════════════════════════════════
   CONFIGURATION  ← Edit these values
═══════════════════════════════════════════════════════════ */

const STREAM_URL = 'https://server.radiostreaming.com.ar/8498/stream';
const CHAT_WS    = 'wss://brunito-production.up.railway.app';

const DEFAULT_SHOW_TIME = '2025-06-01T22:00:00';
let SHOW_TIME = new Date(localStorage.getItem('showTime') || DEFAULT_SHOW_TIME);

/* ═══════════════════════════════════════════════════════════
   FLIP DIGIT
═══════════════════════════════════════════════════════════ */
class FlipDigit {
    constructor(parent) {
        this.val       = null;
        this.animating = false;

        this.el = document.createElement('div');
        this.el.className = 'fd';
        this.el.innerHTML =
            '<div class="fd-new"><span>0</span></div>' +
            '<div class="fd-flap"><div class="fd-flap-num"><span>0</span></div></div>' +
            '<div class="fd-line"></div>';
        parent.appendChild(this.el);

        this._newSpan  = this.el.querySelector('.fd-new > span');
        this._flapSpan = this.el.querySelector('.fd-flap-num > span');
        this._flapEl   = this.el.querySelector('.fd-flap');
    }

    update(v) {
        v = String(v);
        if (v === this.val) return;
        const old = this.val;
        this.val  = v;

        if (old === null) {
            this._newSpan.textContent  = v;
            this._flapSpan.textContent = v;
            return;
        }
        if (this.animating) {
            this._newSpan.textContent  = v;
            this._flapSpan.textContent = v;
            return;
        }

        this.animating = true;
        this._flapSpan.textContent = old;
        this._newSpan.textContent  = v;
        this._resetFlap();

        requestAnimationFrame(() => {
            requestAnimationFrame(() => this.el.classList.add('flipping'));
        });

        setTimeout(() => {
            this.el.classList.remove('flipping');
            this._flapEl.style.animation = 'none';
            this._flapEl.style.transform  = 'rotateX(0deg)';
            this._flapSpan.textContent    = v;
            requestAnimationFrame(() => {
                this._flapEl.style.animation = '';
                this._flapEl.style.transform  = '';
                this.animating = false;
            });
        }, 380);
    }

    _resetFlap() {
        this._flapEl.style.animation = 'none';
        this._flapEl.style.transform  = 'rotateX(0deg)';
        void this._flapEl.offsetWidth;
        this._flapEl.style.animation = '';
        this._flapEl.style.transform  = '';
    }
}

class FlipUnit {
    constructor(containerId) {
        const wrap  = document.getElementById(containerId);
        this.digits = [new FlipDigit(wrap), new FlipDigit(wrap)];
    }
    update(n) {
        const s = String(Math.max(0, Math.floor(n))).padStart(2, '0');
        this.digits[0].update(s[0]);
        this.digits[1].update(s[1]);
    }
}

/* ═══════════════════════════════════════════════════════════
   COUNTDOWN
═══════════════════════════════════════════════════════════ */
const unitDays  = new FlipUnit('fp-days');
const unitHours = new FlipUnit('fp-hours');
const unitMins  = new FlipUnit('fp-mins');
let countdownTimer = null;

function tick() {
    const diff = SHOW_TIME - new Date();
    if (diff <= 0) {
        unitDays.update(0); unitHours.update(0); unitMins.update(0);
        setTimeout(switchToLive, 700);
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

document.getElementById('enterBtn').addEventListener('click', switchToLive);

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
    const color = i === VU_COUNT - 1 ? '#7CFCE1' : '#DFFF00';
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
            addSystemMsg('Conectado al chat.');
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
   ADMIN PANEL
   Trigger: Ctrl+Shift+B
═══════════════════════════════════════════════════════════ */
const adminPanel     = document.getElementById('adminPanel');
const adminDateInput = document.getElementById('adminDateInput');
const adminCurrent   = document.getElementById('adminCurrent');
const adminSave      = document.getElementById('adminSave');
const adminCancel    = document.getElementById('adminCancel');

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'B') openAdmin();
});

function openAdmin() {
    // Pre-fill with current show time in datetime-local format
    const local = new Date(SHOW_TIME.getTime() - SHOW_TIME.getTimezoneOffset() * 60000)
        .toISOString().slice(0, 16);
    adminDateInput.value = local;
    adminCurrent.textContent = 'ACTUAL: ' + SHOW_TIME.toLocaleString();
    adminPanel.classList.remove('hidden');
    adminDateInput.focus();
}

function closeAdmin() {
    adminPanel.classList.add('hidden');
}

adminSave.addEventListener('click', () => {
    const val = adminDateInput.value;
    if (!val) return;
    const newTime = new Date(val);
    if (isNaN(newTime)) return;
    SHOW_TIME = newTime;
    localStorage.setItem('showTime', val);
    // Restart countdown with new time
    clearTimeout(countdownTimer);
    tick();
    closeAdmin();
});

adminCancel.addEventListener('click', closeAdmin);

// Close on backdrop click
adminPanel.addEventListener('click', (e) => {
    if (e.target === adminPanel) closeAdmin();
});
