# Contexto de sesión — ufc-fighter-compare

Actualizado: 2026-11-23

## Estado
- Repo público https://github.com/p-poblete/ufc-fighter-compare. Spec v0.2 aprobada en `docs/spec.md`.
- **Corte 1 (datos) terminado (2026-11-23).** `python -m pipeline.build` genera `data/processed/{fights,fighters}.parquet`, `slugs.csv`, `unmatched.csv` y `web/public/data/{index,meta}.json` + `fighters/<slug>.json`. Datos a 2026-11-21: 7.750 peleas, 2.304 peleadores; `index.json` 65 KB comprimido; ficha máx. 17 KB. Build determinista (mismos hashes en dos ejecuciones). `LICENSE` MIT añadida.
- Módulos: `pipeline/{sources,data,metrics,export,validate,build,refresh_enrichment,paths}.py`; tests en `pipeline/tests/` (87); `pyproject.toml` configura pytest y ruff (B905 ignorado).
- Separado de `~/Proyectos/Personales/ufc-fight-analytics` (consumirá `data/processed/*.parquet`).

## Decisiones (2026-11-23)
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

## Siguiente paso
1. Piero: `git push` y conectar el repo en Cloudflare Pages (raíz `web`, build `npm ci && npm run build`, salida `dist`, Node 24 por `.node-version`). Con eso se cierra el corte 2.
2. Corte 3: radar de percentiles (ECharts), arquetipo y donas de victoria/derrota.
