// Configuración de la app. Todo es opcional.
// Si el servidor de señalización público de PeerJS (0.peerjs.com) falla o está bloqueado en tu red,
// puedes poner aquí el tuyo (peer: { host, port, path, secure }) y servidores TURN en iceServers.
window.ASISTENCIA_CONFIG = window.ASISTENCIA_CONFIG || {
  peer: null,            // null = servidor público de PeerJS
  iceServers: null,      // null = STUN público de Google por defecto
  rotateMs: 15000,       // el QR cambia cada 15 s
  tokenTtlMs: 30000,     // un código sirve máximo 30 s (alcanza para escanear y enviar)
};
