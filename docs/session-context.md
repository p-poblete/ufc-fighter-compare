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

## Verificaciones
- `.venv/bin/pytest` → 87 passed; `ruff check` y `ruff format --check` limpios; `pipeline.build` en línea y `--offline` OK.

## Siguiente paso
Corte 2 (esqueleto publicado): antes, decidir con Piero dirección visual (`design-taste-frontend`) y par destacado de `web/src/config.ts`. Nota: en la fuente, Aldo–Zahabi (2025) figura como Featherweight y por eso Aldo queda en esa división.
