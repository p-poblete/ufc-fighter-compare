# Contexto de sesión — ufc-fighter-compare

Actualizado: 2026-11-23

## Estado
- Repo público https://github.com/p-poblete/ufc-fighter-compare (main sincronizado). Spec v0.2 aprobada en `docs/spec.md`. Falta añadir `LICENSE` (MIT) en el corte 1.
- Separado de `~/Proyectos/Personales/ufc-fight-analytics` (de ahí se portan las funciones de comparación de `src/app.py`).

## Decisiones (2026-11-23)
- Stack: Astro 7 + TypeScript + ECharts 6, web estática en Cloudflare Pages (no Streamlit: personalización insuficiente).
- Datos híbridos: base UFC-Almanac (GitHub, MIT, semanal, 2010→hoy) + enriquecimiento (división, género, cuotas) de Kaggle jerzyszocik (hasta 2026-05-16) y mdabbert de reserva. Cruce por fecha + nombre normalizado: 97,8 %. UFCStats directo descartado (reto anti-bots JS).
- El pipeline vive en este repo y genera el dataset limpio (`data/processed/*.parquet`); el repo de análisis lo consumirá.
- Interfaz, código y README en inglés. Plazo: 2 semanas, ~10 h. Métrica: demo pública estable.
- Al publicar: borrar la app antigua de Streamlit Cloud (repo ufc-fight-analytics).

## Siguiente paso
Spec v0.2 aprobada. Corte 1 (empieza por la puerta de licencias de Kaggle).
