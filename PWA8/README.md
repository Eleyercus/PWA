# AsistenciaSegura (PWA8)

Pase de lista antifraude para UT Cadereyta. Sin servidor propio ni cuentas: funciona en GitHub Pages (HTTPS).

Uso: el docente abre la app → "Soy docente" → inicia la clase dentro del salón (su GPS es el centro) y proyecta el QR.
Los alumnos abren la misma URL → "Soy alumno" → escanean el QR (o escriben el código) → GPS + selfie en vivo.

Controles: QR/código que rota cada 15 s (vale 30 s), distancia al docente (radio configurable; >2x = rechazo),
selfie solo desde cámara, una matrícula una vez, aviso si dos matrículas usan el mismo teléfono, aprobación manual del docente,
exporta CSV. Toda la validación ocurre en el dispositivo del docente.

Límites: GPS falso y QR retransmitido en vivo se dificultan, no se eliminan; la selfie la revisa el docente.
Si la red del plantel bloquea WebRTC o 0.peerjs.com, configura tu servidor en js/config.js (peer / iceServers TURN).
