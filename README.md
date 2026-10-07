# Sorteo Dota 2 con suscriptores de Kick

1. Crea una app en https://kick.com/settings/developer (activa webhooks).
2. Sube esta carpeta a Render o Railway (Node, comando: `npm start`).
   Variables: ADMIN_TOKEN (una clave tuya), DATA_DIR (carpeta de un disco persistente).
3. En tu app de Kick, pon como Webhook URL: https://TU-DOMINIO/webhook/kick
4. Una sola vez: KICK_CLIENT_ID=... KICK_CLIENT_SECRET=... CHANNEL_SLUG=chukysortv node setup.js
5. Abre https://TU-DOMINIO/ y revisa /api/participantes.

COUNT_GIFTER=1 hace que quien regala subs también entre al sorteo.
IMPORTANTE: usa un disco persistente en DATA_DIR o perderás la lista al reiniciar.

## Panel del organizador
- Abre https://TU-DOMINIO/#admin e ingresa tu ADMIN_TOKEN.
- Verás todos los participantes (suscriptores de Kick + registrados en la web, con su Steam ID).
- "Sortear" elige al azar (puedes pedir varios ganadores; nadie gana dos veces) y guarda el historial.
- Estructura de carpetas: server.js, setup.js, package.json y public/index.html.

## Ruleta para el stream
- Abre https://TU-DOMINIO/ruleta.html, ingresa tu ADMIN_TOKEN y pulsa GIRAR (o la barra espaciadora).
- El servidor elige al ganador y la ruleta se anima hasta caer en su nombre; queda en el historial.
- ?demo prueba con nombres de ejemplo. ?obs=1 oculta el panel lateral para capturarla en OBS (Captura de ventana o de navegador).
