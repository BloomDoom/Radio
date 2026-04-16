/* ═══════════════════════════════════════════════════════════
   CONFIGURATION  ← Edit these three values
═══════════════════════════════════════════════════════════ */

// Date & time of the next show (ISO format, local time)
const SHOW_TIME  = new Date('2025-06-01T22:00:00');

// Audio stream URL  (Icecast / SHOUTcast / HLS, etc.)
const STREAM_URL = 'https://server.radiostreaming.com.ar/8498/stream';

// WebSocket chat server  (run server.js on your machine/VPS)
const CHAT_WS    = 'wss://brunito-production.up.railway.app';

/* ═══════════════════════════════════════════════════════════
   FLIP DIGIT
   Each card has a static face (.fd-new) always showing the
   target value, and a flap (.fd-flap) that covers the top
   half with the OLD value and folds back when the value
   changes — revealing the new number underneath.
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
            // First render — set without animation
            this._newSpan.textContent  = v;
            this._flapSpan.textContent = v;
            return;
        }

        if (this.animating) {
            // Already mid-flip — just update the value silently
            this._newSpan.textContent  = v;
            this._flapSpan.textContent = v;
            return;
        }

        this.animating = true;

        // Flap holds the OLD value and will fold away
        this._flapSpan.textContent = old;
        // The card behind already shows the NEW value
        this._newSpan.textContent  = v;

        // Make sure flap is face-forward before animating
        this._resetFlap();

        // Trigger the fold
        // (rAF ensures the reset paint lands before the animation starts)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.el.classList.add('flipping');
            });
        });

        // After fold completes: snap flap back to 0° with new value
        setTimeout(() => {
            this.el.classList.remove('flipping');
            this._flapEl.style.animation = 'none';
            this._flapEl.style.transform  = 'rotateX(0deg)';
            this._flapSpan.textContent    = v;

            // Remove inline overrides in next frame so CSS takes over cleanly
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
        // Force a reflow so the override is committed before we re-enable animation
        void this._flapEl.offsetWidth;
        this._flapEl.style.animation = '';
        this._flapEl.style.transform  = '';
    }
}

/* ── FlipUnit: manages a 2-digit pair (tens + ones) ── */
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
        unitDays.update(0);
        unitHours.update(0);
        unitMins.update(0);
        setTimeout(switchToLive, 700);
        return;
    }

    const totalSecs = Math.floor(diff / 1000);
    unitDays.update(Math.floor(totalSecs / 86400));
    unitHours.update(Math.floor((totalSecs % 86400) / 3600));
    unitMins.update(Math.floor((totalSecs % 3600) / 60));

    countdownTimer = setTimeout(tick, 1000);
}

tick(); // Start immediately

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

        // Fader needs the track height which is 0 when hidden
        setTimeout(initFader, 60);
        // Start chat when entering live
        connectChat();
    }, 680);
}

document.getElementById('enterBtn').addEventListener('click', switchToLive);

/* ═══════════════════════════════════════════════════════════
   FADER PANEL — input[type=range] + VU meters
═══════════════════════════════════════════════════════════ */
const audio       = document.getElementById('radioStream');
const volumeFader = document.getElementById('volumeFader');
const vuLeftEl    = document.getElementById('vuLeft');
const vuRightEl   = document.getElementById('vuRight');

let volume = 0.80;

// Build 15 LED dots per VU column (column-reverse: index 0 = bottom = green)
const VU_COUNT  = 15;
const VU_COLORS = Array.from({ length: VU_COUNT }, (_, i) => {
    if (i > 12) return '#ff0000';
    if (i > 9)  return '#ffae00';
    return '#00ff00';
});

function buildVU(container) {
    for (let i = 0; i < VU_COUNT; i++) {
        const dot = document.createElement('span');
        dot.className    = 'fp-vu-dot';
        dot.dataset.color = VU_COLORS[i];
        container.appendChild(dot);
    }
}

buildVU(vuLeftEl);
buildVU(vuRightEl);

function initFader() {
    volumeFader.value = volume;
    audio.volume      = volume;
}

volumeFader.addEventListener('input', () => {
    volume       = parseFloat(volumeFader.value);
    audio.volume = volume;
});

// ── Web Audio API for VU meters ──
let audioCtx  = null;
let analyserL = null;
let analyserR = null;
let vuRunning = false;

function initAudio() {
    if (audioCtx) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return;
    }
    audioCtx      = new (window.AudioContext || window.webkitAudioContext)();
    const source   = audioCtx.createMediaElementSource(audio);
    const splitter = audioCtx.createChannelSplitter(2);
    analyserL = audioCtx.createAnalyser();
    analyserR = audioCtx.createAnalyser();
    analyserL.fftSize = 64;
    analyserR.fftSize = 64;
    source.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);
    source.connect(audioCtx.destination);
}

function drawVU() {
    if (!vuRunning) return;
    const dataL = new Uint8Array(analyserL.frequencyBinCount);
    const dataR = new Uint8Array(analyserR.frequencyBinCount);
    analyserL.getByteFrequencyData(dataL);
    analyserR.getByteFrequencyData(dataR);
    const avgL = dataL.reduce((a, b) => a + b, 0) / dataL.length;
    const avgR = dataR.reduce((a, b) => a + b, 0) / dataR.length;
    updateVU(vuLeftEl,  avgL);
    updateVU(vuRightEl, avgR);
    requestAnimationFrame(drawVU);
}

function updateVU(container, val) {
    const active = Math.min(VU_COUNT, Math.floor(val / 8));
    container.querySelectorAll('.fp-vu-dot').forEach((dot, i) => {
        if (i < active) {
            dot.style.background = dot.dataset.color;
            dot.style.boxShadow  = `0 0 6px ${dot.dataset.color}`;
        } else {
            dot.style.background = '#1a1a1a';
            dot.style.boxShadow  = 'none';
        }
    });
}

function resetVU() {
    [vuLeftEl, vuRightEl].forEach(col =>
        col.querySelectorAll('.fp-vu-dot').forEach(dot => {
            dot.style.background = '#1a1a1a';
            dot.style.boxShadow  = 'none';
        })
    );
}

/* ═══════════════════════════════════════════════════════════
   AUDIO PLAYER
═══════════════════════════════════════════════════════════ */
const playBtn = document.getElementById('playBtn');
let isPlaying = false;

playBtn.addEventListener('click', () => { if (!isPlaying) startStream(); });

function updatePlayState(playing) {
    isPlaying = playing;
    playBtn.classList.toggle('connected', playing);
    playBtn.classList.remove('error');
}

function startStream() {
    playBtn.classList.remove('connected', 'error');
    audio.src    = STREAM_URL;
    audio.volume = volume;
    initAudio();

    audio.play()
        .catch(() => {
            playBtn.classList.add('error');
            audio.src = '';
        });

    audio.addEventListener('playing', () => {
        updatePlayState(true);
        vuRunning = true;
        drawVU();
    }, { once: true });
}

function stopStream() {
    audio.pause();
    audio.src = '';
    vuRunning = false;
    resetVU();
    updatePlayState(false);
}

audio.addEventListener('error', () => {
    if (!isPlaying) return;
    playBtn.classList.add('error');
    stopStream();
    setTimeout(startStream, 3000);
});

/* ═══════════════════════════════════════════════════════════
   WEBSOCKET CHAT
═══════════════════════════════════════════════════════════ */
const chatDot      = document.getElementById('chatDot');
const chatMessages = document.getElementById('chatMessages');
const msgInput     = document.getElementById('msgInput');
const nickInput    = document.getElementById('nickInput');
const sendBtn      = document.getElementById('sendBtn');
let ws = null;

function connectChat() {
    if (ws) return; // already connected or connecting
    try {
        ws = new WebSocket(CHAT_WS);

        ws.onopen = () => {
            chatDot.classList.add('on');
            addSystemMsg('Conectado al chat.');
        };

        ws.onmessage = (e) => {
            try {
                const d = JSON.parse(e.data);
                addChatMsg(d.nick, d.text, d.time);
            } catch { /* ignore malformed */ }
        };

        ws.onclose = () => {
            chatDot.classList.remove('on');
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
    const nick = nickInput.value.trim() || 'Anonymous';
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ nick, text, time }));
    } else {
        addSystemMsg('Not connected to chat.');
    }
    msgInput.value = '';
}

sendBtn.addEventListener('click', sendMessage);
msgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

function addChatMsg(nick, text, time) {
    const div = document.createElement('div');
    div.className = 'msg';
    div.innerHTML =
        `<span class="nick">${esc(nick)}</span>${esc(text)}<span class="time">${time}</span>`;
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

// HTML-escape to prevent XSS
function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
