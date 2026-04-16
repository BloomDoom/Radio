═══════════════════════════════════════════════
   MIX MIX RADIO — Documentación del proyecto
═══════════════════════════════════════════════

ARCHIVOS
────────

index.html
  Estructura principal de la página web.
  Contiene dos pantallas:
    - Pantalla 1: cuenta regresiva con reloj flip hasta el próximo show.
    - Pantalla 2: reproductor en vivo con panel de fader, botón de play y chat.

style.css
  Todos los estilos visuales del sitio.
  Incluye el diseño del reloj flip, el panel del fader con medidores VU,
  el chat en vivo y el diseño responsive para computadoras, tablets y celulares.

script.js
  Toda la lógica del sitio. Se divide en:
    - Configuración: URL del stream, URL del chat WebSocket y fecha del próximo show.
    - Reloj flip: animación de los dígitos de la cuenta regresiva.
    - Cambio de pantalla: transición de la cuenta regresiva al reproductor en vivo.
    - Panel fader: control de volumen con input[type=range] y medidores VU
                   animados mediante Web Audio API.
    - Reproductor de audio: conexión al stream de radio, manejo de errores
                            y estados del botón de play.
    - Chat WebSocket: conexión al servidor de chat, envío y recepción
                      de mensajes en tiempo real.

server.js
  Servidor de chat en tiempo real (Node.js).
  Recibe mensajes de los usuarios conectados y los reenvía a todos
  los demás en tiempo real mediante WebSockets. No usa base de datos,
  los mensajes no se guardan. Se ejecuta en Railway.

package.json
  Dependencias del servidor (únicamente el paquete "ws" para WebSockets).

CONFIGURACIÓN
─────────────

Para modificar los valores principales, editar las primeras líneas de script.js:

  SHOW_TIME  → Fecha y hora del próximo show (formato ISO, hora local).
  STREAM_URL → URL del stream de audio (Icecast / SHOUTcast).
  CHAT_WS    → URL del servidor de chat WebSocket.

SERVIDORES
──────────

  Stream de audio : https://server.radiostreaming.com.ar/8498/stream
  Chat WebSocket  : wss://brunito-production.up.railway.app
