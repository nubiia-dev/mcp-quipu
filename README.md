# mcp-quipu

Servidor MCP para la [API de Quipu](https://quipuapp.github.io/api-v1-docs/): facturación, gastos, contactos y contabilidad para autónomos y pequeñas empresas en España.

Permite que un asistente como Claude consulte y opere tu cuenta de Quipu en lenguaje natural: *«¿cuánto he facturado este trimestre?»*, *«créame la factura de septiembre para este cliente»*, *«dame el PDF de la última factura»*.

Construido por [Nubiia](https://nubiia.es). Hermano de [`mcp-holded`](https://github.com/nubiia-dev/mcp-holded).

> **Estado: alfa (v0.1.0).** 18 herramientas sobre contactos, facturas, gastos y agregación fiscal. El resto de recursos de la API está mapeado en [`docs/api-map.md`](docs/api-map.md) pero aún no expuesto.

## Instalación

```bash
npm install -g @nubiia/mcp-quipu
```

## Configuración

Necesitas credenciales de API de Quipu (Configuración → API) y el *slug* de tu cuenta, que es el primer segmento de tus URLs de Quipu: `https://getquipu.com/<slug>/…`

```json
{
  "mcpServers": {
    "quipu": {
      "command": "npx",
      "args": ["-y", "@nubiia/mcp-quipu"],
      "env": {
        "QUIPU_CLIENT_ID": "tu_client_id",
        "QUIPU_CLIENT_SECRET": "tu_client_secret",
        "QUIPU_OWNER_SLUG": "tu_slug"
      }
    }
  }
}
```

## Herramientas disponibles

### Contactos
| Herramienta | Descripción |
|---|---|
| `list_contacts` | Lista contactos, con filtro por nombre y paginación |
| `get_contact` | Detalle de un contacto |
| `create_contact` | Crea un contacto (requiere `name`; el NIF/CIF es obligatorio para facturarle) |
| `update_contact` | Actualiza solo los campos indicados |
| `delete_contact` | Elimina un contacto |

### Facturas
| Herramienta | Descripción |
|---|---|
| `list_invoices` | Lista facturas emitidas, acotables por periodo |
| `get_invoice` | Detalle de una factura |
| `create_invoice` | Emite una factura con sus líneas, IVA e IRPF |
| `update_invoice` | Actualiza una factura |
| `delete_invoice` | Elimina una factura |
| `get_invoice_download_url` | URL temporal para descargar el PDF |

### Gastos e ingresos adicionales
| Herramienta | Descripción |
|---|---|
| `list_additional_incomes` | Lista gastos e ingresos, acotables por periodo |
| `get_additional_income` | Detalle de una entrada |
| `create_additional_income` | Registra una factura de proveedor o gasto deducible |
| `update_additional_income` | Actualiza una entrada |
| `delete_additional_income` | Elimina una entrada |
| `get_additional_income_download_url` | URL temporal del PDF |

### Fiscalidad
| Herramienta | Descripción |
|---|---|
| `get_tax_summary` | IVA repercutido, soportado, saldo y retenciones de un trimestre o rango |

## Notas de diseño

**OAuth2, no API key.** A diferencia de Holded, Quipu emite tokens que caducan. El cliente los cachea en memoria, los renueva con un margen de 60 segundos y comparte una sola petición entre llamadas concurrentes. Ante un 401 invalida el token y reintenta.

**JSON:API aplanado.** Quipu devuelve `{ data: { id, attributes: {…} } }`. Las herramientas aplanan la respuesta a `{ id, …attributes }`, porque los modelos razonan mucho mejor sobre objetos planos y se ahorran tokens de envoltorio.

**Las escrituras van más limitadas que las lecturas.** Una factura creada por error no es una fila en una base de datos: es un documento con efectos legales. Las operaciones de escritura tienen cupos más estrictos y las destructivas están anotadas con `destructiveHint`.

**La aritmética fiscal se hace en código, no en el modelo.** Quipu no expone ningún endpoint de modelos fiscales (130, 303, 111), así que las cifras hay que derivarlas de facturas y gastos. `get_tax_summary` recorre todas las páginas de ambos recursos, suma con redondeo a céntimos y devuelve el saldo ya calculado. Pedirle a un modelo que sume una lista larga de importes token a token es una forma fiable de obtener una cifra fiscal equivocada.

**Los importes vienen como texto y con nombres poco obvios.** El importe base es `total_amount_without_taxes` y el impuesto es `vat_amount` — no existen `total` ni `subtotal`. El sumador acepta coma decimal, ignora vacíos y, ante un valor no parseable, lo excluye y avisa en la respuesta en lugar de propagar un `NaN` silencioso.

**Sobre eliminar facturas.** La normativa española exige rectificar mediante factura rectificativa, no borrando una factura ya numerada. `delete_invoice` existe porque la API lo permite, pero la descripción de la herramienta advierte de ello para que el modelo no lo proponga a la ligera.

## Desarrollo

```bash
npm install
npm run build
npm test
npm run lint
```

## Roadmap

- [ ] `simplified_invoices` — tickets y facturas simplificadas (7 ops)
- [ ] `paysheets` — nóminas (5 ops)
- [ ] `numbering_series`, `accounting_categories`, `accounting_subcategories`
- [ ] `attachments` y `book_entries`
- [ ] Resolución automática del `owner_slug` vía `GET /users/{id}`

## Licencia

MIT
