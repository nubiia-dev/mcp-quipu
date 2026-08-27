# Flujo de publicación

Checklist de lanzamiento de `mcp-quipu`. Cada alta es un backlink de un dominio con autoridad real, así que esto no es solo distribución: es el motor de autoridad del programa orgánico de nubiia.es.

Referencia de lo conseguido con `mcp-holded`: glama.ai (DR 74) y npm (DR 47) son, a día de hoy, **los dos únicos backlinks legítimos** que tiene nubiia.es. Todo lo demás en su perfil de enlaces es spam.

---

## 0 · Antes de publicar

- [ ] CI en verde en Node 22 y 24
- [ ] `npm test` en verde
- [ ] Probado contra una cuenta real de Quipu, no solo compilando
- [ ] README con instalación copiable y lista de herramientas al día
- [ ] Commits en formato convencional, para que `semantic-release` calcule bien la versión
- [ ] Secret `NPM_TOKEN` presente en el repositorio
- [ ] Landing publicada en `https://nubiia.es/quipu/api/`

## 1 · npm y MCP Registry (automático)

La publicación la hace `semantic-release` desde `main`, igual que en `mcp-holded`. No se publica a mano ni se crean tags a mano:

1. Se mergea a `main` un commit con formato convencional (`feat:`, `fix:`, `perf:`…).
2. `.github/workflows/release.yml` compila, pasa los tests y ejecuta `semantic-release`, que:
   - calcula la versión siguiente a partir de los commits,
   - publica `@nubiia/mcp-quipu` en **npm** con provenance,
   - sincroniza `server.json` y `manifest.json` con la versión nueva (`scripts/sync-server-version.mjs`),
   - escribe `CHANGELOG.md` y lo commitea a `main` con `[skip ci]`,
   - crea el tag `vX.Y.Z` y la **GitHub Release** con las notas.
3. Ese tag dispara `.github/workflows/publish-mcp.yml`, que se autentica por OIDC y publica en el **MCP Registry** oficial. No hace falta token: la autenticación va por la identidad del repositorio.

Requisito único: el secret `NPM_TOKEN` (token de automatización de npm con permiso de publicación sobre el scope `@nubiia`) configurado en el repositorio.

Verificar después:

- `npm view @nubiia/mcp-quipu version`
- que el servidor aparece en el registro como `io.github.nubiia-dev/mcp-quipu`

Un commit que no sea `feat`/`fix`/`perf` (por ejemplo `chore:` o `docs:`) no genera versión nueva: es el comportamiento esperado, no un fallo del workflow.

## 2 · Directorios

| Directorio | Cómo se da de alta | Notas |
|---|---|---|
| **Glama** (glama.ai) | Indexa desde GitHub automáticamente | El de mayor autoridad (DR 74). Detecta el repo por los topics `mcp` y `model-context-protocol` |
| **Smithery** (smithery.ai) | Alta manual conectando el repo | Pide descripción y variables de entorno; ya están en `server.json` |
| **mcp.so** | Alta manual mediante formulario | Rápido, pide repo y descripción |
| **PulseMCP** | Alta manual o indexación | Buena tracción en el nicho |
| **Awesome MCP Servers** | Pull request al repo de GitHub | Sigue el formato exacto del README y ordena alfabéticamente |
| **Claude Desktop Extensions** | Vía `manifest.json` (MCPB) | Empaquetar con `mcpb pack` cuando se quiera distribuir como extensión |

## 3 · Product Hunt

Lanzar entre semana, por la mañana en hora peninsular. El ángulo que funciona no es "otro MCP más", sino el problema concreto:

> *La API de Quipu no expone los modelos de IVA. Este conector los calcula.*

Enlazar a `https://nubiia.es/quipu/api/`, no a la home.

## 4 · Contenido y difusión

- [ ] Post en LinkedIn con el ángulo técnico: los cuatro límites de la API que descubrimos leyendo el OpenAPI
- [ ] Enlazar la landing desde `/conectar-quipu-con-ia/` y desde la página de servicios
- [ ] Cuando existan varios conectores, crear `/open-source/` como índice y enlazar todos entre sí
- [ ] Comparativa Holded vs Quipu, aprovechando que tenemos conector de ambos

## 5 · UTMs

Todos los enlaces salientes hacia nubiia.es desde directorios y Product Hunt deben llevar UTM, o el tráfico entra como `direct` y no se puede atribuir nada:

```
https://nubiia.es/quipu/api/?utm_source=<directorio>&utm_medium=referral&utm_campaign=mcp-quipu
```

## 6 · Después del lanzamiento

- [ ] Comprobar en Ahrefs que los backlinks de los directorios aparecen (tardan de días a semanas)
- [ ] Registrar el efecto en el Domain Rating del proyecto Nubiia (id 10147474)
- [ ] Vigilar si Quipu lanza un MCP oficial: pasó con Holded en junio y con Factorial en julio de 2026. Si ocurre, este pasa a mantenimiento y se añade un aviso en el README apuntando al oficial

---

## Aviso sobre el nombre

`quipu` tiene 27.000 búsquedas/mes en España, pero el volumen está **contaminado**: el quipu es también el sistema de nudos incaico (`quipu inca` 250, `quipu meaning` 250). No interpretar ese número como demanda del software.

Lo realmente capturable del ecosistema es `quipu facturas` (1.100/mes, KD 0, CPC 2,50 $), que ataca `/conectar-quipu-con-ia/`. La landing `/quipu/api/` existe por otro motivo: es el destino de los enlaces de los directorios y la prueba de capacidad técnica ante el cliente, no una página de volumen.
