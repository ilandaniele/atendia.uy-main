# Webhooks Salientes — Atendia

Los webhooks salientes permiten que Atendia notifique en tiempo real a sistemas externos (CRMs, ERPs, herramientas de automatización como Make o n8n) cada vez que ocurre un evento relevante: un cliente potencial capturado, un pedido creado, una cita modificada, etc.

---

## Cómo configurarlos

1. Ir a **Administración → Clientes → (cliente)** o a **Configuración** en el panel de usuario.
2. En la sección **Webhooks**, hacer clic en **Agregar**.
3. Completar el formulario:
   - **Nombre**: identificador amigable (ej: *CRM HubSpot*, *n8n Leads*).
   - **URL destino**: endpoint HTTPS que recibirá los eventos.
   - **Clave secreta (HMAC)**: se genera automáticamente (UUID v4). Copiarla y guardarla en un lugar seguro — se usa para verificar la autenticidad de cada llamada.
   - **Eventos**: seleccionar uno o más eventos a escuchar.
   - **Habilitado**: activa o desactiva el webhook sin eliminarlo.
4. Guardar. El webhook queda activo de inmediato.

---

## Eventos disponibles

Todos los webhooks se envían como `HTTP POST`. El tipo de acción se identifica por el campo `event` del payload.

| Evento                   | Cuándo se dispara                                      |
|--------------------------|-------------------------------------------------------|
| `lead.created`           | El asistente de IA captura un nuevo cliente potencial |
| `lead.updated`           | Un usuario cambia el estado de un cliente potencial   |
| `lead.deleted`           | Un usuario elimina un cliente potencial               |
| `order.created`          | El asistente de IA registra un nuevo pedido           |
| `order.updated`          | Un usuario cambia el estado de un pedido              |
| `appointment.created`    | El asistente de IA agenda una nueva cita              |
| `appointment.updated`    | Un usuario confirma, cancela o modifica una cita      |

> **Nota:** cuando la IA cancela o modifica una cita/pedido, el evento disparado es `appointment.updated` / `order.updated` con el campo `status` actualizado en el payload.

---

## Formato del payload

Cada llamada es un `HTTP POST` con `Content-Type: application/json`. El body sigue esta estructura:

```json
{
  "event": "lead.created",
  "timestamp": "2026-04-18T14:30:00.000Z",
  "data": { ... }
}
```

El campo `data` varía según el tipo de evento. Los campos internos de la base de datos (`_id`, `_creationTime`, referencias a otros documentos) no se exponen — `_id` se mapea a `id`.

### lead.*

```json
{
  "id": "jh7abc123def456",
  "name": "María García",
  "phone": "59899123456",
  "status": "new | pending | contacted | scheduled | confirmed | closed | rejected",
  "summary": "Interesada en el servicio premium",
  "type": "lead",
  "requiresAction": false
}
```

### order.*

```json
{
  "id": "jh7abc456def789",
  "name": "Juan Pérez",
  "phone": "59899654321",
  "deliveryAddress": "18 de Julio 1234, Montevideo",
  "items": [
    { "productName": "Pizza Mozzarella", "quantity": 2, "priceAtMoment": 350 }
  ],
  "totalAmount": 700,
  "currency": "UYU",
  "status": "pending | confirmed | shipped | delivered | canceled"
}
```

### appointment.*

```json
{
  "id": "jh7abc789def012",
  "customerName": "Ana López",
  "customerPhone": "59898765432",
  "start": "2026-04-18T20:00:00.000Z",
  "end": "2026-04-18T21:00:00.000Z",
  "notes": "Prefiere horario de mañana",
  "status": "pending | confirmed | delivered | canceled"
}
```

> Los campos `start` y `end` se envían como strings ISO 8601 en UTC.

---

## Verificación de firma (HMAC-SHA256)

Cada request incluye el header:

```
X-Atendia-Signature: sha256=<firma_hex>
```

La firma siempre se calcula y envía — la clave secreta se genera automáticamente al crear el webhook. La firma es HMAC-SHA256 del body JSON crudo (exactamente como se envía, sin parsear ni reformatear).

### Verificación en Node.js

```javascript
const crypto = require("crypto");

function verifySignature(rawBody, secret, signatureHeader) {
  const expected = "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}

// En Express (acepta POST en la ruta del webhook):
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["x-atendia-signature"];
  if (!verifySignature(req.body, process.env.WEBHOOK_SECRET, sig)) {
    return res.status(401).send("Firma inválida");
  }
  const payload = JSON.parse(req.body);
  // payload.event → "lead.created" | "lead.updated" | "lead.deleted" | …
  console.log("Evento recibido:", payload.event, payload.data);
  res.sendStatus(200);
});
```

### Verificación en Python

```python
import hmac, hashlib

def verify_signature(raw_body: bytes, secret: str, signature_header: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)
```

---

## Integración con n8n

1. En n8n, crear un nodo **Webhook** con método POST.
2. Copiar la URL generada y pegarla en Atendia → Webhooks → URL destino.
3. El nodo recibe el payload; usar el campo `event` para enrutar a distintos flujos con un nodo **Switch**.

### Flujo ejemplo

```
[Webhook] → [Switch por event] → lead.created       → [HubSpot: Create Contact]
                               → order.created       → [Slack: Notificar canal #pedidos]
                               → appointment.updated → [Google Calendar: Update Event]
```

---

## Integración con Make (ex-Integromat)

1. En Make, agregar un módulo **Webhooks → Custom Webhook**.
2. Copiar la URL y configurarla en Atendia.
3. Usar el módulo **Router** para filtrar por `event`.

---

## Comportamiento y garantías

| Aspecto | Detalle |
|---|---|
| **Método HTTP** | `POST` (siempre) |
| **Timeout** | 10 segundos por intento |
| **Reintentos** | Sin reintentos automáticos (fire-and-forget) |
| **Orden** | No garantizado cuando hay múltiples webhooks |
| **Fallos** | Se loguean en la consola de Convex; no bloquean la operación principal |
| **Webhooks inactivos** | Se ignoran completamente (no se envían) |

> Se recomienda que el endpoint destino responda con `2xx` en menos de 3 segundos y procese el evento de forma asíncrona si la lógica es pesada.

---

## Troubleshooting

**No llega ningún evento**
- Verificar que el webhook esté **habilitado** en el panel.
- Verificar que la URL sea accesible públicamente (no `localhost`).
- Verificar que el evento esté en la lista de eventos suscritos.

**Error de firma**
- Verificar que la clave secreta en Atendia coincida exactamente con la que se usa para verificar.
- Asegurar que se calcula el HMAC sobre el **body crudo** (raw bytes), no el JSON parseado.

**Datos inesperados en `data`**
- El campo `data` refleja el estado del registro en el momento del evento. Para `lead.updated` y similares, incluye el estado más reciente ya fusionado.
