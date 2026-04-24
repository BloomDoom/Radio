RADIO SECRETA — v2.0
====================

Web-based radio streaming player with countdown, live chat, and admin panel.


FILES
-----
index.html  — markup
style.css   — styles
script.js   — all logic


CONFIGURATION  (top of script.js)
----------------------------------
STREAM_URL        — audio stream endpoint
CHAT_WS           — WebSocket server URL
DEFAULT_SHOW_TIME — fallback date/time for the countdown (ISO 8601)


HOW IT WORKS
------------
1. Opens on a countdown screen showing days / hours / minutes until the next show.
2. Clicking ENTRAR (or when the countdown hits zero) transitions to the live player.
3. Live player includes a volume fader, stereo VU meters, play/stop button, and chat.
4. Chat connects automatically via WebSocket on entering the live screen.


ADMIN PANEL
-----------
Shortcut: Ctrl + Shift + Z  (works on any screen)

Lets you update the next show date/time. The value is saved to localStorage
so it persists across page reloads. Pressing Escape or clicking outside the
panel closes it without saving.
