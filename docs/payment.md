# Flujo de Cobro y Gestión de Suscripciones

## Resumen

Atendia usa **dLocal Go** para procesar suscripciones mensuales. Cuando un pago es exitoso, el canal de **WhatsApp (Whapi)** del cliente se activa automáticamente. Un cron diario verifica que cada cliente con suscripción haya pagado en los últimos 35 días; si no, el canal se desactiva hasta que el próximo cobro llegue.

---

## Actores y servicios

| Actor | Responsabilidad |
|---|---|
| **dLocal Go** | Plataforma de pagos. Gestiona planes, suscripciones y cobra mensualmente. |
| **Convex** | Backend serverless. Recibe el webhook, actualiza la base de datos y ejecuta crons. |
| **Whapi Partner API** | Gestiona canales de WhatsApp. Controla el modo del canal (trial / live / dev_archive). |
| **SendGrid** | Envía emails transaccionales al owner del cliente. |

---

## Flujo completo: primera suscripción

```
Usuario (billing UI)
  │
  ├─ 1. Selecciona plan en /panel/facturacion
  │       └─ billing.createPaymentLink → dLocal Go → devuelve subscribe_url
  │
  ├─ 2. Es redirigido a dLocal Go para ingresar datos de pago
  │
  └─ 3. dLocal Go cobra y envía webhook POST /api/webhooks/dlocal
         │
         ├─ app/routes/api/webhooks/dlocal.ts
         │     ├─ Verifica firma HMAC-SHA256 (1ª línea de defensa)
         │     └─ Llama a convex/billing.handleWebhookPayment
         │
         └─ convex/billing.handleWebhookPayment
               ├─ Re-verifica firma HMAC (2ª línea de defensa)
               ├─ Detecta que es suscripción nueva (cliente sin subscriptionId)
               ├─ Llama a clients.activateSubscription
               │     └─ Vincula plan + dlocalGoSubscriptionId al cliente
               │         y elimina trialEndsAt
               ├─ Acredita tokens (clients.addTokens)
               ├─ Crea factura PAID (invoices.create)
               └─ ★ Activa canal Whapi: changeChannelMode("live")
                     └─ Requiere WHAPI_PARTNER_TOKEN en variables de entorno
```

### Condición de activación Whapi

El canal de Whapi **solo se activa a modo `live` una vez**: cuando el campo `client` no tiene `dlocalGoSubscriptionId` aún (primera suscripción). Para renovaciones mensuales el canal ya está en `live` y no se modifica.

Si el canal no tiene `whapiChannelId` configurado, el paso se omite sin error.

---

## Flujo: renovación mensual

```
dLocal Go (cobro automático cada mes)
  └─ Webhook POST /api/webhooks/dlocal
       └─ billing.handleWebhookPayment
             ├─ Detecta subscriptionId ya vinculado al cliente
             ├─ Acredita tokens
             └─ Crea factura PAID
             (NO toca Whapi — canal ya está en live)
```

---

## Cron: desactivar canales sin pago reciente

**Archivo:** `convex/billingCrons.ts` → `checkWhapiChannelSubscriptions`
**Horario:** diario a las 11:00 UTC (`convex/crons.ts`)

### Lógica

1. Obtiene todos los clientes activos con plan + subscriptionId (`getSubscribedClientsInternal`).
2. Para cada cliente, revisa si tiene al menos una factura `PAID` en los últimos **35 días** (margen para ciclos mensuales con posibles retrasos).
3. Si **no** tiene pago reciente:
   - Obtiene el canal de WhatsApp del cliente (`getWhapiChannelByClientInternal`).
   - Si tiene `whapiChannelId`, llama a `changeChannelMode("dev_archive")`.
4. El canal queda desactivado hasta que dLocal procese el siguiente cobro exitoso.

> **Nota:** el canal NO se reactiva automáticamente en renovaciones (el cron de billing solo activa en la primera suscripción). La reactivación manual se puede hacer desde el panel de administración de Whapi Partner, o extendiendo la lógica del webhook para llamar `changeChannelMode("live")` también en renovaciones si el canal estaba en `dev_archive`.

---

## Modos de canal Whapi

| Modo | Descripción | Cuándo se asigna |
|---|---|---|
| `trial` | Modo de prueba, mensajes limitados | Al crear el canal en Whapi Partner |
| `live` | Totalmente activo | Al recibir el primer pago exitoso |
| `dev_archive` | Inactivo, mensajes bloqueados | Cuando el cliente no paga en 35 días |
| `dev` | Modo desarrollo | No usado por Atendia actualmente |

---

## Otros crons de facturación

| Cron | Horario UTC | Descripción |
|---|---|---|
| `checkTrialEnding` | 10:00 | Email de advertencia si el trial vence en 24–48 hs |
| `checkTrialExpired` | 10:30 | Desactiva el cliente si el trial venció y no hay plan |
| `checkWhapiChannelSubscriptions` | 11:00 | Desactiva canal Whapi si no hay pago en 35 días |
| `deleteExpiredProfiles` | 03:00 | Elimina perfiles con solicitud de baja vencida (60 días) |

---

## Variables de entorno requeridas

| Variable | Uso |
|---|---|
| `DLOCALGO_API_KEY` | Autenticación con dLocal Go |
| `DLOCALGO_SECRET_KEY` | Verificación de firma HMAC del webhook |
| `DLOCALGO_API_URL` | URL base de dLocal Go |
| `WHAPI_PARTNER_TOKEN` | Token para Whapi Partner API (gestión de canales) |
| `SITE_URL` / `VITE_SITE_URL` | URL del sitio para links en emails |
| `VITE_CONVEX_URL` | URL del deployment de Convex |

---

## Cómo modificar planes y precios

### 1. En dLocal Go

Los planes (precio, frecuencia, nombre) se crean y modifican en el panel de dLocal Go o mediante `DLocalService`:

```typescript
// lib/services/dlocal.service.ts
await dlocal.createPlan({ name, amount, currency, frequency, frequencyType });
await dlocal.updatePlan(planId, { amount }); // ojo: puede afectar suscripciones activas
```

Cada plan en dLocal tiene un `id` numérico.

### 2. En Convex (tabla `plans`)

Cada plan interno referencia el `id` de dLocal mediante `dlocalPlanId`. Asegurarse de que exista un registro en la tabla `plans` con el `dlocalPlanId` correcto. El webhook usa `api.plans.getByDlocalPlanId` para enlazar el pago con el plan interno.

### 3. En la UI de facturación

`app/routes/user/billing/index.tsx` muestra los planes disponibles. Si se agrega o modifica un plan, actualizar las opciones mostradas al usuario.

---

## Cómo modificar los términos y condiciones

Los términos de uso y la política de privacidad se almacenan en Convex en las tablas `terms` y `privacy`. Se editan desde el panel de administración.

Para modificar aspectos relacionados con facturación (frecuencia de cobro, períodos de gracia, política de cancelación):

1. Actualizar el texto en el panel admin → Términos y Condiciones.
2. Si se cambia la frecuencia de cobro (ej. de mensual a anual), ajustar `SUBSCRIPTION_GRACE_PERIOD_MS` en `convex/billingCrons.ts` en consecuencia.
3. Si se cambia la política de cancelación, revisar el cron `checkWhapiChannelSubscriptions` para ajustar el período de gracia.

---

## Diagrama de estados del canal Whapi

```
[Onboarding]
     │
     ▼
  [trial]  ←── Canal creado por WhapiPartnerService.createChannel()
     │
     │  Primer pago exitoso (billing.handleWebhookPayment)
     ▼
   [live]  ←── Canal activo, mensajes habilitados
     │
     │  Sin pago en 35 días (checkWhapiChannelSubscriptions)
     ▼
[dev_archive] ←── Canal inactivo
     │
     │  Próximo cobro exitoso (billing.handleWebhookPayment — renovación)
     │  * Actualmente NO reactiva automáticamente; ver nota más arriba.
     ▼
   [live]
```
