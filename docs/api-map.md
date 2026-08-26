# Mapa de la API de Quipu v1

Extraído del OpenAPI oficial (`https://quipuapp.github.io/api-v1-docs/openapi.yaml`, OpenAPI 3.1.0) el 26 de agosto de 2026.

**Total: 49 operaciones en 27 paths.**

- **Base URL:** `https://getquipu.com`
- **Formato:** JSON:API — todo recurso llega envuelto en `data.attributes`
- **Accept obligatorio:** `application/vnd.quipu.v1+json` en todos los endpoints salvo `POST /oauth/token`
- **Auth:** OAuth2 Client Credentials. `POST /oauth/token` con `Authorization: Basic base64(client_id:client_secret)` y cuerpo `grant_type=client_credentials&scope=ecommerce`
- **Prefijo de recurso:** todos los endpoints de negocio cuelgan de `/{owner_slug}/…`

## Estado de implementación

| Recurso | Ops | Estado |
|---|---|---|
| `contacts` | 5 | ✅ implementado |
| `invoices` | 7 | ✅ implementado (6 de 7; falta `/download` directo) |
| `simplified_invoices` | 7 | ⬜ pendiente |
| `additional_incomes` | 7 | ✅ implementado (6 de 7) |
| `paysheets` | 5 | ⬜ pendiente |
| `numbering_series` | 5 | ⬜ pendiente |
| `accounting_subcategories` | 5 | ⬜ pendiente |
| `attachments` | 3 | ⬜ pendiente |
| `accounting_categories` | 2 | ⬜ pendiente |
| `book_entries` | 1 | ⬜ pendiente |
| `users` | 1 | ⬜ pendiente |

## Detalle por recurso

### invoices (7) — facturas emitidas
```
GET     /{owner_slug}/invoices
POST    /{owner_slug}/invoices
GET     /{owner_slug}/invoices/{id}
PATCH   /{owner_slug}/invoices/{id}
DELETE  /{owner_slug}/invoices/{id}
GET     /{owner_slug}/invoices/{id}/download
GET     /{owner_slug}/invoices/{id}/ephemeral_open_download
```

### simplified_invoices (7) — tickets / facturas simplificadas
```
GET     /{owner_slug}/simplified_invoices
POST    /{owner_slug}/simplified_invoices
GET     /{owner_slug}/simplified_invoices/{id}
PATCH   /{owner_slug}/simplified_invoices/{id}
DELETE  /{owner_slug}/simplified_invoices/{id}
GET     /{owner_slug}/simplified_invoices/{id}/download
GET     /{owner_slug}/simplified_invoices/{id}/ephemeral_open_download
```

### additional_incomes (7) — gastos e ingresos adicionales
```
GET     /{owner_slug}/additional_incomes
POST    /{owner_slug}/additional_incomes
GET     /{owner_slug}/additional_incomes/{id}
PATCH   /{owner_slug}/additional_incomes/{id}
DELETE  /{owner_slug}/additional_incomes/{id}
GET     /{owner_slug}/additional_incomes/{id}/download
GET     /{owner_slug}/additional_incomes/{id}/ephemeral_open_download
```

### contacts (5)
```
GET     /{owner_slug}/contacts
POST    /{owner_slug}/contacts
GET     /{owner_slug}/contacts/{id}
PATCH   /{owner_slug}/contacts/{id}
DELETE  /{owner_slug}/contacts/{id}
```

### paysheets (5) — nóminas
```
GET     /{owner_slug}/paysheets
POST    /{owner_slug}/paysheets
GET     /{owner_slug}/paysheets/{id}
PATCH   /{owner_slug}/paysheets/{id}
DELETE  /{owner_slug}/paysheets/{id}
```

### numbering_series (5) · accounting_subcategories (5)
CRUD completo en ambos, mismo patrón.

### attachments (3) · accounting_categories (2) · book_entries (1) · users (1)
```
POST    /{owner_slug}/attachments
GET     /{owner_slug}/attachments/{id}
DELETE  /{owner_slug}/attachments/{id}
GET     /{owner_slug}/accounting_categories
GET     /{owner_slug}/accounting_categories/{id}
GET     /{owner_slug}/book_entries
GET     /users/{id}
```

## Corrección al research de julio

El documento [2026-07-31-research-mcps-pymes-espana.md](../../nubiia-web/docs/plans/2026-07-31-research-mcps-pymes-espana.md) atribuía a Quipu un ángulo basado en **«modelos AEAT (130, 303, 111) y OCR de tickets»**.

**La API v1 no expone ningún endpoint de modelos fiscales ni de OCR.** Los recursos disponibles son facturas, facturas simplificadas, ingresos y gastos adicionales, contactos, nóminas, series de numeración, categorías contables, adjuntos y asientos.

Esto no invalida la demo —«¿cuánto IVA pagaré este trimestre?» sigue siendo respondible— pero cambia cómo se construye: hay que **derivar las cifras agregando facturas y gastos por periodo**, no leerlas de un endpoint. Es más trabajo y conviene que el MCP ofrezca una herramienta de agregación propia en lugar de dejarle la aritmética al modelo.
