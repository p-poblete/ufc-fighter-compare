# Contexto de sesión — ufc-fighter-compare

Actualizado: 2026-11-24

## Estado
- Repo público https://github.com/p-poblete/ufc-fighter-compare. Spec v0.2 aprobada en `docs/spec.md`.
- **Corte 1 (datos) terminado (2026-11-23).** `python -m pipeline.build` genera `data/processed/{fights,fighters}.parquet`, `slugs.csv`, `unmatched.csv` y `web/public/data/{index,meta}.json` + `fighters/<slug>.json`. Datos a 2026-11-21: 7.750 peleas, 2.304 peleadores; `index.json` 65 KB comprimido; ficha máx. 17 KB. Build determinista (mismos hashes en dos ejecuciones). `LICENSE` MIT añadida.
- Módulos: `pipeline/{sources,data,metrics,export,validate,build,refresh_enrichment,paths}.py`; tests en `pipeline/tests/` (87); `pyproject.toml` configura pytest y ruff (B905 ignorado).
- Separado de `~/Proyectos/Personales/ufc-fight-analytics` (consumirá `data/processed/*.parquet`).

## Decisiones (2026-11-23)
- **Regla de trabajo (Piero):** toda decisión de diseño (formas, colores, iconos, tipografía, disposición) se le pregunta antes de aplicarla; solo se aplica directamente lo pedido de forma explícita y los arreglos de bugs.
- Stack: Astro 7 + TypeScript + ECharts 6, web estática en Cloudflare Pages.
- Licencias: jerzyszocik CC0, mdabbert CC BY 4.0 → **variante A** (snapshot `data/raw/enrichment.parquet` versionado, cuotas en los JSON, atribución a Matt Dabbert en pie y README). Licencias leídas de la página de Kaggle vía búsqueda web (Kaggle no se deja leer sin JS); conviene confirmarlas a ojo una vez.
- Cruce con ±1 día: 98,0 %. Homónimos separados por URL de UFCStats (solo Bruno Silva → `bruno-silva` mosca, `bruno-silva-2` medio). Perfil con 8 métricas a 0 = sin datos.
- Percentil = rango medio (por debajo + ½ empates) / N × 100; SApM guardado ya invertido (`percentiles.inverted`). `duration.decision_pct` sobre W/L/D (sin NC).
- Dirección visual (Piero): fondo negro, bordes naranja #f08c00, sombra del color de la esquina (A rojo, B azul) en los componentes de cada peleador. Boceto en vault `Proyectos/UFC/UFC - Interfaz*.md`.
- Interfaz, código y README en inglés. Al publicar: borrar la app antigua de Streamlit Cloud.

- Par destacado: Makhachev vs Topuria. Apodos "NULL" de la fuente → `null` (`data.text_or_none`) y validación que lo impide.
- Web (corte 2): Astro 7.4.13 + TS, CSS propio (`web/src/styles/app.css`), Inter Variable autoalojada. Estilo base «true-black-flat» del skill con la paleta de Piero encima (bordes naranja y sombras de esquina permitidos a propósito: `--allow heavy-shadow,heavy-borders`). Un panel por esquina (identidad + buscador + filtros), botón Swap, «Tale of the tape» en espejo y récord en barras CSS (carrera y UFC). Lógica pura en `web/src/lib/{render,search,url-state,format}.ts`; el par destacado se prerenderiza y el cliente (`lib/app.ts`) re-renderiza según `?a=&b=`. ECharts entra en el corte 3.
- npm: registry.npmjs.org caído el 23-nov; instalado desde registry.npmmirror.com y `package-lock.json` reescrito a registry.npmjs.org (npm ci limpio + build comprobados).

## Verificaciones
- `.venv/bin/pytest` → 88 passed; `ruff check`/`format --check` limpios; `pipeline.build --offline` OK.
- Web: `tsc --noEmit` y `npm run build` OK; `npm ci` limpio desde el lockfile OK. Inspector del skill (`--app`) 0 FAIL a 1440/768/390 (WARN `numeric-align` defendido: el tale of the tape va en espejo). Prueba e2e con Chromium (script temporal, no versionado): CA3 («jose aldo»/«JOSÉ ALDO»), CA4 (URL reabierta + swap, sin errores de consola), CA5 (4 casos) y 360 px sin scroll horizontal → 10/10.

## Dashboard v0.3 (2026-11-23, tarde)
- Rediseño decidido por Piero (spec §3.1): gris carbón casi monocromo, resplandor rojo desde la izquierda y azul desde la derecha; columnas propias pegadas a los bordes (ficha, R3, M2, apuestas por tipo de cuota, historial), centro compartido (K2, T2, estilo P1 radar + P3, R1 + M3) y fila completa con los gráficos de app.py: rendimiento por pelea con selector, retorno por pelea y duración (ECharts 6.1, carga diferida, 182 KB comprimidos).
- Perfil estático por peleador en `/fighters/<slug>/` (2.304 páginas; build en ~10 s).
- Laboratorios sin versionar: `web/src/pages/lab*.astro` y `web/public/lab/` (fotos de Commons para la prueba). Borrar al cerrar el diseño.
- Pendiente de decidir: fotos (Wikidata/Commons ~25 % de cobertura; tratamiento en escala de grises).
- e2e (script temporal): CA3, CA4, swap, CA5 y 360 px → 10/10.

## v0.5 (2026-11-23, noche)
- Barra superior = navegación (Compare, Fighters, Method, Source) + herramientas elegidas por Piero: búsqueda Ctrl+K (`lib/tools.ts`, paleta con Enter=rojo, Shift+Enter=azul, Ctrl+Enter=perfil), recientes (localStorage), compartir (nativo en móvil o copiar), exportar imagen (`lib/card.ts`, PNG 1200×630), menú View con unidades métrico/imperial y base de percentiles (`lib/settings.ts`). Swap se mantiene como herramienta en la portada.
- Selector de peleador con filtro arriba de cada columna; forma de 10 = índice clicable; historial completo plegado; alturas al contenido y espejo por pares en JS (`mirror()` en app.ts); relieve en W/L, racha y chips; detalle del radar tras icono.
- Páginas nuevas: `/fighters/` (directorio filtrable, prerenderizado) y `/method/`.
- Material de bloques: escarcha de esquina (C) desde 2026-11-24 (antes vidrio A): bloques de cada columna teñidos de rojo/azul desde el borde exterior; bloques compartidos con rojo a la izquierda y azul a la derecha; perfil en naranja (solo) desde la izquierda. Historial abierto con scroll que llena la columna; detalle del radar a la derecha del radar; selector con filtros género + división.
- Pendiente de confirmar por Piero (decisiones tomadas sin consulta): iconos de herramientas, agrupar unidades+base en «View», leyenda de métodos solo en el lado rojo, maquetación de la imagen exportada, columnas del directorio, textos de Method.

## v0.5.2–v0.6 y cierre (2026-11-24)
- v0.5.2: iconos de postura por arquetipo, selector de esquina en una línea, récord en cuadros estilo GitHub, leyenda en ambas esquinas. v0.6: especialidades y disciplina (pipeline + iconos), identidad en retrato cuadrado (monograma), todas las peleas como cuadros, desplegables de vidrio.
- Push hecho (13 commits, hasta 48007d1).
- Laboratorios borrados (respaldo en `~/Respaldos/ufc-compare-labs-20261124.tgz`) y sus líneas quitadas de `.gitignore`. Build OK (2.307 páginas).
- Fotos (decisión de Piero: A+B): Commons vía Wikidata, en color natural, con monograma si no hay foto; crédito tras un © arriba a la derecha del retrato (tooltip con autor, licencia y enlace). `pipeline/photos.py` (`python -m pipeline.photos`, manual) genera el snapshot versionado `data/raw/photos.csv`: emparejado por «UFC athlete ID» P9722 = slug y, si no, por nombre único con ID de Sherdog. 563/2.304 (24 %). La web enlaza la miniatura de Commons (480 px). Pendiente: la imagen exportada (`lib/card.ts`) aún usa monograma.

## v0.7 — revisión pez dorado de interfaz (2026-11-24)
- Aplicado lo que pidió Piero (ronda registrada en spec §10): orden bajo 1180 px con `display: contents` en las columnas y áreas de grid (identidad+récord de A y B → comparación → métodos → historiales); flechas verde/roja en tasas sin «Edge», neutras en edad y peso; badges con foco visible, tooltip anclado al borde de la esquina, Escape (en `tools.ts`), arquetipo con palabra, 3 especialidades + «+N»; «No data» en radar con capa desactivada; 44 px en móvil; `.panel:hover/:focus-within { z-index: 10 }` arregla tooltips tapados por el bloque vecino.
- Piero: barras de método se quedan con colores de esquina; forma = toda la carrera.
- Piero: el bloque del radar empieza a la altura del récord y termina donde acaban los historiales (≥1181 px). `alignRadar()` en app.ts estira el tale of the tape (filas repartidas); `.col--mid` en `auto 1fr` y radar flexible. Si el tape es más alto que la ficha (1181–1300 px), `alignRadar()` reduce el padding de sus filas (`--mu-pad`). Radio del radar en píxeles (lo máximo que deja el bloque, con margen para las etiquetas) y redibujado al cambiar el alto. Alineado comprobado a 1200–1920 px.
- Verificado: tsc y build OK; Playwright a 1440/768/390 sin scroll horizontal, comparación a 1.319 px en móvil (antes 2.419), ningún tooltip tapado, Escape y foco OK. Sin commit.
- Menores no aplicados: Tab en cuadros de forma, desalineación del nombre cuando los badges ocupan dos filas (Makhachev a 1440), barra partida a 768, tabla de /fighters/ en móvil.

- Detalle del radar: un solo bloque de filas en una columna de 230 px; cada fila lleva el nombre de la métrica arriba y las cifras de A y B debajo (perfil: una cifra). Sin texto explicativo debajo. Con el detalle abierto no sale el tooltip del radar: se iluminan el nombre del eje (rich text de ECharts) y sus vértices (`.radar__vertex`, DOM); fila ↔ eje en los dos sentidos.
- Cabecera del radar: selector de capa a la izquierda, botón de la ficha a la derecha; quitado «vs all fighters» (y `popLabel`/`aside` sin uso). La población del percentil ya no se indica en la página.
- Icono de campeón aplicado: `title_bout` nuevo en `enrichment.parquet` (mdabbert, 330 peleas hasta 2026-03-28; jerzyszocik solo 17 por la etiqueta «Title»), reconstruido desde la caché de kagglehub con el resto de columnas idénticas; `fights.parquet` + `title_bout`; JSON: `titles` {wins, divisions, last} por peleador y `title` por pelea. 127 peleadores con título. Cinturón dorado arriba a la izquierda del retrato con tooltip. Títulos posteriores a marzo de 2026 faltan salvo los que marque jerzyszocik.
- Cuadros UFC del récord: brillo del color de la esquina (antes blanco).
- Coherencia de datos (script en scratchpad, sin versionar): títulos coherentes (322 peleas, ambos lados, un ganador). Bug arreglado: 250 peleadores sin récord profesional mostraban «null-null-null» (récord, meta description del perfil, imagen exportada); ahora usan el récord UFC como ya hacía `index.json` (`careerRecord()`/`recordText()` en render.ts; tipo `record` anulable). Pendiente de decidir: 14 peleadores con récord profesional por debajo del UFC (fuente desactualizada, p. ej. Aljamain Sterling 26-5 con 6 derrotas UFC).
- Tras `pipeline.build` el servidor de desarrollo dejó de servir JSON regenerados: reiniciado (`astro dev --port 4321 --host 127.0.0.1`).

## v0.3 en borrador (2026-11-25)
- Revisión de Piero (`UFC - Revision 24_11_26.md` en el vault) pasada a `docs/spec.md` §11: qué entra, qué queda para otro avance (calculadora de ROI, prime, métodos de toda la carrera, mapa de golpes y acciones por momento: sin datos), cortes y preguntas abiertas §11.4. Decisiones de §11.4 cerradas el 2026-11-25 (grupos: radar superpuesto 3–4 con colores dinámicos; tarjeta B con índice compuesto; campeón oro/plata/gris; exportar con casillas; volteo 3D). Pez dorado: ronda 1 NO LISTO, ronda 2 LISTO CON CAMBIOS; todo aplicado en spec §11 y registrado en §10. Spec renombrada a v0.8. Volteo en todo corner.identity; en la comparación el reverso omite lo del tale of the tape.

## v0.8 con /minerva (2026-11-25)
- Corte 1 (diálogo ampliado, cinturones oro/plata/dorado viejo #b0905a, `champions.csv` revisado, «UFC since 2010») APROBADO y en el índice, sin commit.
- Corte 2 (portada: radar↔tape, primera vista ≥1181×900) sin indexar en web/src/{styles/app.css,lib/app.ts,lib/render.ts}: 7 iteraciones. Funciona salvo 13 px de desfase tape/récord a 1181–~1200×900 (tope de columna). Pendiente: Piero decide aceptar o ajustar márgenes; después argos + linceo + censor.
- Estado detallado en `docs/minerva-estado.md` (no versionado). Decisiones nuevas en spec §11.5.
- Lección de coste: el corte 2 se alargó por falso positivo de linceo (barra de Astro dev), premisa errónea del orquestador (encoger retrato) y revisiones completas tras cada ajuste. Próximos cortes: menos rondas de agentes, ajustes pequeños directos.

## Siguiente paso
0. Piero revisa los supuestos de §11.5 → `/minerva` por cortes (empezar por el corte 1: datos y diálogo).
1. Piero: conectar el repo en Cloudflare Pages (raíz `web`, build `npm ci && npm run build`, salida `dist`, Node 24). Después, borrar la app antigua de Streamlit Cloud (share.streamlit.io → app → Delete).
2. Piero: confirmar decisiones v0.5 sin consultar (iconos de herramientas, menú View, imagen exportada, columnas del directorio, textos de Method).
3. Corte 3: donas de victoria/derrota (radar y arquetipo ya hechos).
