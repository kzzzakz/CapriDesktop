# Trabajo en el fork de Capri Desktop

- `origin` es `kzzzakz/CapriDesktop`; `upstream` es `nunezValen/CapriDesktop`. Las integraciones y PR del fork van a `origin` salvo petición explícita. No hacer force push ni borrar ramas.
- Antes de diseñar una feature, revisar el módulo equivalente y los cambios recientes de `upstream/main`. Extender sus contratos y servicios existentes; evitar un segundo flujo que duplique el mismo estado o responsabilidad.
- Mantener cambios acotados, estilo local, nombres claros y comentarios mínimos. No reformatear archivos ajenos al cambio. Conservar los comentarios existentes y ajustarlos si cambia su comportamiento.
- Commits y títulos de PR: `tipo(scope): descripción`. Sin firmas ni crédito de autoría o coautoría para agentes.

## Arquitectura que se debe conservar

- Electron main posee procesos, archivos, credenciales y estado persistente. El renderer usa `window.api`: definir canales y payloads en `src/main/ipc/channels.ts`, handlers en `register-handlers.ts` y actualizar juntos `src/preload/index.ts` e `index.d.ts`.
- Las peticiones a modelos pasan por `llmFetch` y los prompts personalizados por `llmBody`. Ampliar `llm-gateway.ts` para proveedores; no añadir peticiones directas que eviten Claude Code, Codex o la configuración elegida. Conservar cancelación, limpieza de procesos y límites propios de cada proveedor.
- La personalidad y los presets pertenecen a `system-prompt-store.ts`. Usar `personaIntro` en las features y mantener sus reglas de formato, idioma y hechos separadas de la personalidad. La memoria persistente pertenece a `memory-service.ts`.
- Los juegos usan adapters que emiten `GameEvent` al bus; `reaction-engine.ts` decide silencio, prioridad, frecuencia y entrega. Mantener selección/lock de agentes en `services/valorant/`, separado de la telemetría de lectura de `game/adapters/valorant/`.
- Gaming Mode se controla mediante `windowManager.setGamingMode`. Los activadores automáticos pasan la fuente `'game'`; el modo manual conserva la fuente `'user'`. Al cerrar un juego, comprobar otros adapters y sesiones antes de apagarlo. La detección de foreground del fork sigue controlando click-through y Ctrl al alternar ventanas.
- Reutilizar componentes, stores, tokens `cp-*` y ajustes existentes. Conservar los controles accesibles en ventanas estrechas. Las etiquetas de teclas se derivan de `shared/hotkeys.ts` y `useHotkeys`, nunca de flechas fijas.
- Añadir textos de interfaz en los diez archivos `src/renderer/src/i18n/`. Los catálogos `src/shared/lines/*.json` son arrays posicionales: cada traducción debe conservar el índice de su línea inglesa; no unirlos ni ordenarlos por valor. Valorant tiene fallbacks nativos en `valorant-templates.ts`.
- Persistir ajustes en `app.getPath('userData')` mediante el servicio dueño de cada ajuste. No cambiar `appId` ni sobrescribir preferencias al actualizar. Los recursos empaquetados se localizan mediante `app-paths.ts`.

## Compatibilidad y sincronización

- Conservar hitbox por píxeles, opacidad gaming, click-through por foreground, atajos editables, posición sentada, controles del deck, proveedores Claude Code/Codex, selección/lock de Valorant, anuncios de resultados y adapter de WuWa.
- Cuando upstream incorpore una PR del fork por squash, comparar el comportamiento de ambos lados y combinar solo las diferencias reales. No elegir un archivo completo con `ours` o `theirs` sin revisar también sus cambios fuera del conflicto.
- Sincronizar upstream con un merge en rama desde `origin/main`, conservar su ascendencia y verificar que `upstream/main` sea ancestro del resultado. Para contribuir al original, preparar una rama desde upstream con solo la feature solicitada y sin las extensiones privadas del fork.
- Ejecutar `npm run typecheck` y las pruebas relacionadas con lo cambiado. Para una sincronización amplia: reacciones/captura, selección de Valorant, gaming, hitbox, posición sentada y proveedores CLI. `test-deck-layout.cjs` necesita antes `npm run build`.
- Tras integrar una actualización autorizada: `npm run dist:win`, verificar el directorio instalado real, cerrar su árbol de procesos incluidos los hijos Python de voz, instalar con `/S` y abrir la app conservando datos. Quitar `ELECTRON_RUN_AS_NODE` del entorno del proceso Electron; comprobar arranque y el hash de `resources/app.asar` contra el build.

Estas reglas se basan en la integración de upstream hasta `22d2ad2` (posterior a v1.0.4). Revisar los patrones de upstream de nuevo antes de futuras features; esta guía no sustituye leer el código actual.
