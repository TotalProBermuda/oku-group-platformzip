# Carta de Notificación de Brecha de Datos Personales a la ANTAI — Plantilla (ES)

> **[REVISIÓN DE ASESORÍA LEGAL PENDIENTE — NO ENVIAR TAL CUAL]**
>
> Esta plantilla es un borrador de ingeniería preparado para que el
> equipo de guardia tenga un punto de partida. La asesoría legal de
> Panamá debe revisar y aprobar la redacción final, el canal de
> presentación y los plazos antes de cualquier presentación ante la
> ANTAI. El DPO es la única persona autorizada a retirar este aviso,
> y solo después de la aprobación escrita de la asesoría legal.

> **Este es un artefacto operativo de ingeniería, no es asesoría legal.**

---

**A:** Autoridad Nacional de Transparencia y Acceso a la Información
(ANTAI), República de Panamá
**Canal:** _Confirmar con la asesoría legal al momento de la
presentación — los canales publicados por la ANTAI para notificaciones
de brechas de datos personales cambian._
**De:** OKÜ Group, S.A. — _nombre de la entidad legal a confirmar por
la asesoría legal_
**Oficial de Protección de Datos:** `<nombre del DPO>`,
`<correo del DPO>`, `<teléfono del DPO>`
**Fecha de este aviso (UTC):** `<AAAA-MM-DD HH:MM Z>`
**Fecha en que OKÜ tomó conocimiento (UTC):** `<AAAA-MM-DD HH:MM Z>`
**Referencia interna del incidente:** `INC-AAAA-NNN`

---

## 1. Tipo de notificación

- [ ] Notificación inicial (cuadro completo aún no conocido — se
  presentará una notificación complementaria conforme al Art. 38 del
  Decreto 285 "sin dilación indebida").
- [ ] Notificación complementaria que actualiza la referencia interna
  `INC-AAAA-NNN`.
- [ ] Notificación final / de cierre.

## 2. Naturaleza de la brecha de datos personales

`<Descripción en lenguaje claro: qué ocurrió, cómo ocurrió, cuándo
ocurrió, cuándo OKÜ tomó conocimiento. Indicar si afecta a la
confidencialidad, integridad o disponibilidad — o una combinación.>`

## 3. Categorías y número aproximado de titulares afectados

- Categorías de titulares: `<p. ej. asistentes pagos en Panamá;
  beneficiarios incorporados para pagos vía Banesco; postulantes a
  empleo>`.
- Número aproximado de afectados: `<entero o rango — 1–10 / 11–100 /
  101–1k / >1k>`.
- Base de la estimación: `<p. ej. consulta a AuditLog sobre el endpoint
  afectado entre <inicio> y <fin>>`.

## 4. Categorías y volumen aproximado de registros de datos personales

- Categorías de datos personales: `<asignar a los nombres canónicos de
  docs/privacy/data-classification.md — p. ej. account.identity,
  beneficiary.bank (solo últimos 4 dígitos), payments.metadata>`.
- Número aproximado de registros: `<entero o rango>`.
- **No afectados** (de forma explícita, cuando corresponda): `<p. ej.
  números de tarjeta de pago en bruto — nunca ingresan a los sistemas
  de OKÜ; números de cuenta bancaria de beneficiarios en bruto —
  cifrados en reposo con AES-256-GCM y no descifrados en la ruta
  afectada>`.

## 5. Consecuencias probables para los titulares afectados

`<Evaluación en lenguaje claro: riesgo de fraude de identidad, riesgo
de pérdida financiera, riesgo reputacional, pérdida de
confidencialidad del secreto profesional, etc. Indicar explícitamente
cuándo la evaluación es de "bajo riesgo" y por qué.>`

## 6. Medidas de contención y remediación

- Acciones de contención adoptadas (con marcas de tiempo en UTC):
  `<lista copiada de la fila del REGISTRO containmentSummary>`.
- Acciones de remediación completadas: `<lista>`.
- Acciones de remediación en curso, con fechas objetivo: `<lista>`.
- Medidas de prevención de recurrencia: `<cambios de proceso /
  código / capacitación>`.

## 7. Notificación a los titulares afectados

- [ ] Sí — la notificación se envió el `<AAAA-MM-DD>` por
  `<canal — típicamente correo electrónico de registro>`. Las
  traducciones ES + PT se enviaron en la misma ventana.
- [ ] No — fundamento aprobado por la asesoría legal: `<fundamento>`.
- [ ] Diferida — motivo: `<motivo>`; fecha prevista: `<AAAA-MM-DD>`.

## 8. Dimensión transfronteriza / proveedor (cuando corresponda)

`<Si interviene un proveedor de docs/privacy/cross-border-transfers.md
(Replit, Resend, Cybersource, Sentry, Cloudmersive, Banesco, futuro
proveedor de IA): indicar el nombre del proveedor, la base legal de la
transferencia original, la fecha en que OKÜ recibió el aviso de brecha
del proveedor y una referencia de la copia del aviso del proveedor.>`

## 9. Contacto para seguimiento

- DPO: `<nombre>`, `<correo>`, `<teléfono>`.
- Suplente: `<nombre>`, `<correo>`, `<teléfono>`.
- Asesoría legal: `<nombre de la firma>`, `<contacto>`.

## 10. Anexos

- `<Lista: aviso de brecha del proveedor (si lo hay), extractos
  redactados de AuditLog, plantilla de notificación a titulares
  efectivamente utilizada, etc.>`

---

_Firmado,_

`<nombre del DPO>`
Oficial de Protección de Datos, OKÜ Group, S.A.
