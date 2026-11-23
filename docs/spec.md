# Especificación — UFC Fighter Compare

> Fase 1 (Elefante) del Método de trabajo con IA. Debe permitir construir **sin preguntar**: lo que no esté aquí no existe.

Versión: 0.2 · Fecha: 2026-11-23 · Estado: aprobada (Piero, 2026-11-23)

## 1. Encuadre

- **Objetivo:** una web pública que compare dos peleadores de la UFC lado a lado (perfil físico, récord, estilo, vías de victoria y derrota, historial, duración de peleas y rendimiento frente a las cuotas), con datos que se actualizan cada semana. Pieza de portafolio de Piero Poblete.
- **Usuario:** (1) reclutadores y técnicos que abren el enlace desde el CV o GitHub, a menudo en el móvil; (2) aficionados que quieren comparar a dos peleadores antes de un evento.
- **Métrica de éxito:** demo pública estable. La URL carga en un móvil medio con LCP < 2,5 s (Lighthouse móvil) y no falla con ningún par de peleadores del índice.
- **Fecha límite y horas:** 2 semanas desde la aprobación de la spec (≈ 2026-12-07), unas 10 h en total.

## 2. Problema

El comparador actual vive dentro de `ufc-fight-analytics/src/app.py`: un archivo Streamlit de 1.370 líneas que mezcla carga, métricas y gráficos, descarga Kaggle en cada arranque y usa un dataset parado en 2026-03-28. Streamlit no permite el nivel de diseño que necesita una pieza de portafolio, y el repositorio no tiene README, demo ni versiones fijadas.

## 3. Alcance

Incluye:

- **Pipeline de datos en Python** dentro de este repositorio: descarga, limpieza, cruce de fuentes, métricas y generación de JSON estáticos.
- **Web estática (Astro + TypeScript)** con:
  - Selector de dos peleadores (A y B): búsqueda por nombre con autocompletado, sin distinguir mayúsculas ni tildes, y filtros opcionales por género y división. Botón para intercambiar A y B.
  - Estado en la URL (`?a=<slug>&b=<slug>`) para compartir una comparación. Reglas:
    - Sin parámetros: se muestra el par destacado de `web/src/config.ts` (el build falla si alguno de sus slugs no existe en `index.json`).
    - Un solo parámetro válido: se rellena ese lado y el otro selector queda vacío.
    - Slug inexistente: aviso «Fighter not found» y selector vacío en ese lado (si lo son los dos, ambos vacíos).
    - `a == b`: aviso «Pick a different fighter» y B vacío.
    - Las vistas comparativas solo se dibujan con A y B válidos; con un solo lado se ve su ficha.
  - **Ficha**: nombre, apodo si existe, edad (calculada en el cliente a partir de `dob`; si no hay, la `age` del JSON), altura, alcance, peso, guardia, división y récord profesional total (V-D-E). Todo campo nulo se muestra como «—».
  - **Récord en barras**: victorias, derrotas y empates de ambos.
  - **Radar de estilo** con las 8 métricas de carrera de UFCStats (SLpM, StrAcc, SApM, StrDef, TDAvg, TDAcc, TDDef, SubAvg), normalizadas como percentil 0–100.
    - Población: peleadores con ≥ 3 peleas en la UFC desde 2010 y las 8 métricas no nulas.
    - Si A y B comparten división, se usa el percentil de esa división; si no, o si alguno no tiene división, el global. La leyenda dice cuál («vs Lightweight» / «vs all fighters»).
    - SApM se invierte (100 − percentil) para que más alto sea siempre mejor; la leyenda lo indica.
    - Peleador fuera de la población o con métricas nulas: «No data» en el radar.
  - **Arquetipo** (Striker / Grappler / Balanced): sustituye los umbrales fijos de `clasificar_arquetipo_base`. Con percentiles de su división (global si no tiene división): Striker si SLpM ≥ 70 y TDAvg < 70; Grappler si TDAvg ≥ 70 y SLpM < 70; si no, Balanced. Fuera de la población del percentil: `null` y no se muestra.
  - **Vías de victoria y de derrota** (donas): KO/TKO, Submission, Decision, Other (DQ y similares), contadas sobre sus peleas en la UFC desde 2010.
  - **Historial**: tabla de peleas en la UFC (fecha, rival enlazado a la comparación `?a=<peleador>&b=<rival>`, resultado, método, asalto y tiempo del asalto `m:ss`, cuota decimal o «—»), ordenada de la más reciente a la más antigua, en un panel desplegable.
  - **Rendimiento por pelea**: dispersión con una métrica seleccionable (golpes significativos conectados, precisión, derribos, intentos de sumisión) por pelea, con color según el resultado.
  - **Duración de las peleas**: distribución en minutos de la duración de sus peleas y porcentaje que llega a la decisión.
  - **Cuotas y ROI** (apuesta fija de 100 a favor del peleador en cada pelea con cuota):
    - Retorno por pelea: `100 × (odds − 1)` si gana, `−100` si pierde, `0` si D o NC.
    - `n` = peleas con `odds_decimal` no nulo (D y NC incluidas). `ROI % = Σ retorno / (100 × n) × 100`. Se muestra total y por tipo de cuota, con `n` y cobertura (`n` / peleas totales en la UFC).
    - Tipos de cuota (decimal, intervalos semiabiertos): Heavy favorite (1, 1,50); Favorite [1,50, 2,00); Pick'em [2,00, 2,50); Underdog [2,50, 4,00); Heavy underdog [4,00, ∞).
    - Categoría con `n` < 5: etiqueta «small sample». `n` = 0: «No data».
    - Victorias reales frente a esperadas: `Σ implied_prob_fair` sobre las peleas con probabilidad justa (sin D/NC), comparada con las victorias reales de esas mismas peleas.
  - Pie de página con fecha de la última actualización de datos, fuentes, licencias y enlace al repositorio.
- **Interfaz en inglés**; código, identificadores y README en inglés. Esta spec y `docs/session-context.md`, en español.
- **Actualización semanal automática** con GitHub Actions.
- **Despliegue** en Cloudflare Pages conectado al repositorio de GitHub.

### Fuera de alcance

- PCA, t-SNE, UMAP, clústeres, correlaciones con cuotas, gráficos globales por división (son del repositorio de análisis `ufc-fight-analytics`).
- Predicciones o modelos de quién ganará.
- Comparar más de dos peleadores.
- Fotos de peleadores (derechos de imagen): se usa un avatar con iniciales.
- Peleas anteriores a 2010 en historial, donas y dispersión (la fuente base empieza en 2010). El récord total sí incluye toda la carrera.
- Cuentas de usuario, backend o base de datos.
- Interfaz en español o bilingüe.

## 4. Criterios de aceptación

- [x] CA1 · Dado el pipeline, cuando ejecuto `python -m pipeline.build`, entonces se generan `data/processed/fights.parquet`, `data/processed/fighters.parquet`, `data/processed/slugs.csv`, `web/public/data/index.json`, `web/public/data/meta.json` y un `web/public/data/fighters/<slug>.json` por entrada del índice, y las validaciones del contrato (sección 6.3) pasan.
- [x] CA2 · Dado `index.json`, cuando lo inspecciono, entonces contiene a todos los peleadores con al menos una pelea en la UFC desde 2010 y ningún `slug` se repite.
- [ ] CA3 · Dada la web, cuando escribo «jose aldo» o «JOSÉ ALDO» en el buscador, entonces aparece José Aldo entre las 5 primeras sugerencias.
- [ ] CA4 · Dados dos peleadores seleccionados, cuando copio la URL y la abro en otra pestaña, entonces veo la misma comparación.
- [ ] CA5 · Dadas las URL `?a=<inexistente>`, `?a=<válido>` (sin `b`), `?a=x&b=x` y `?a=<inexistente>&b=<inexistente>`, cuando las abro, entonces se cumplen las reglas de estado en la URL de la sección 3, sin errores en la consola.
- [ ] CA6 · Dado un peleador sin cuotas, sin estadísticas por pelea, sin perfil de carrera o sin división, cuando lo comparo, entonces la ficha muestra «—» en los campos nulos, cada vista sin datos muestra «No data» con el motivo y el resto de la página funciona.
- [ ] CA6b · Dado cualquier enlace de rival del historial, cuando lo sigo, entonces abre una comparación válida (nunca «Fighter not found»).
- [ ] CA7 · Dado cualquier par, cuando miro la ficha, el récord, el radar, las donas, el historial, la dispersión, la duración y las cuotas, entonces todos se ven y las cifras coinciden con los JSON (comprobado con 3 pares fijos en `pipeline/tests/`).
- [ ] CA8 · Dada la vista de cuotas, cuando hay ROI, entonces se muestra con su `n` y la cobertura; si `n` < 5 en una categoría, se marca «small sample».
- [ ] CA9 · Dado un móvil de 360 px de ancho, cuando recorro la página, entonces no hay desplazamiento horizontal y los gráficos se leen.
- [ ] CA10 · Dada la demo publicada, cuando paso Lighthouse móvil, entonces LCP < 2,5 s, CLS < 0,1 y Accesibilidad ≥ 90.
- [ ] CA11 · Dado el workflow semanal, cuando se ejecuta y `fights.parquet` cambia, entonces hace commit de los datos regenerados y Cloudflare Pages vuelve a publicar; si no cambia, no hace commit; si las validaciones fallan, no hace commit y el workflow queda en rojo.
- [ ] CA12 · Dado el README, cuando lo abro en GitHub, entonces tiene captura, enlace a la demo, fuentes y licencias, método (cruce de fuentes, cuotas sin margen, percentiles), limitaciones y cómo ejecutarlo en local.
- [ ] CA13 · Dadas las dependencias, entonces `pipeline/requirements.txt` fija versiones exactas (`==`) y `web/package-lock.json` está versionado.
- [x] CA14 · Dadas las métricas, entonces existen tests de `pytest` para el récord, las vías de victoria y derrota, el ROI, el tipo de cuota, la probabilidad implícita sin margen y el arquetipo.

## 5. Cortes verticales

| Corte | Qué se puede usar o enseñar al terminarlo | Criterios que cubre |
|---|---|---|
| 1. Datos | `python -m pipeline.build` genera el dataset limpio y los JSON; tests del contrato y de métricas en verde. | CA1, CA2, CA13 (Python), CA14 |
| 2. Esqueleto publicado | Web en Cloudflare Pages: buscador, selección de A y B, URL compartible, ficha y récord en barras. | CA3, CA4, CA5, CA13 (web) |
| 3. Estilo | Radar con percentiles, arquetipo y donas de victoria y derrota. | CA6 (parcial), CA7 (parcial) |
| 4. Historial | Panel de historial, dispersión de rendimiento y duración de las peleas. | CA6, CA7 |
| 5. Cuotas | Vista de ROI con `n`, cobertura, victorias reales frente a esperadas. | CA7, CA8 |
| 6. Pulido y cierre | Pase de diseño, móvil, Lighthouse, workflow semanal, README con captura; se elimina la app antigua de Streamlit Cloud. | CA9, CA10, CA11, CA12 |

Cada corte termina con: verificación → captura → commit → actualizar `docs/session-context.md` y la nota del vault `Proyectos/UFC/UFC.md`.

## 6. Decisiones técnicas

- **Stack:** Astro 7 + TypeScript (stack por defecto del método), CSS propio, gráficos con Apache ECharts 6 importando solo los módulos usados (`echarts/core`). La interactividad vive en un único script cliente de la página; sin framework de componentes.
- **Pipeline:** Python 3.12, pandas 3.1, pyarrow 26, kagglehub 1.0, pytest 9, ruff. Versiones exactas en `pipeline/requirements.txt`.
- **Objetivo Baseline:** Widely available.
- **Despliegue:** Cloudflare Pages con integración Git (build `npm ci && npm run build` en `web/`, salida `web/dist`). No hace falta ningún secreto: el workflow semanal solo hace commit en `main`.
- **Repositorio:** `p-poblete/ufc-fighter-compare`, público, licencia MIT para el código.

### 6.1 Estructura del código

```
pipeline/                 # Python: datos → métricas → JSON
  sources.py              # descarga de UFC-Almanac y lectura del snapshot de enriquecimiento
  data.py                 # limpieza, normalización de nombres, slugs, cruce de fuentes → fights / fighters
  metrics.py              # récord, vías de victoria/derrota, ROI, tipo de cuota, prob. implícita sin margen,
                          # percentiles y arquetipo (portado de ufc-fight-analytics/src/app.py)
  export.py               # index.json y fighters/<slug>.json
  build.py                # orquesta: sources → data → validate → export
  validate.py             # comprobaciones del contrato (6.3)
  refresh_enrichment.py   # regenera data/raw/enrichment.parquet desde Kaggle (manual)
  tests/
  requirements.txt
data/
  raw/enrichment.parquet  # snapshot versionado (pequeño) de división, género y cuotas
  processed/              # fights.parquet, fighters.parquet (versionados: el análisis los consume)
web/
  src/pages/index.astro
  src/lib/data.ts         # carga de index.json y fighters/<slug>.json, tipos
  src/lib/charts/         # radar.ts, record.ts, donuts.ts, scatter.ts, duration.ts, odds.ts
  src/lib/search.ts       # normalización y búsqueda
  src/lib/url-state.ts
  src/styles/
  src/config.ts           # par destacado por defecto
  public/data/            # JSON generados (versionados)
.github/workflows/update-data.yml
```

Funciones de `app.py` que se portan a `metrics.py` (lógica, no código Streamlit): `calcular_retorno` (pasa a cuota decimal: `stake * (odds - 1)` si gana, `-stake` si pierde, `0` en empate o sin resultado), `get_tipo_apuesta` (umbrales de la sección 3 en decimal), `get_historial_apuestas`, `get_historial_scatter`, `get_historial_tiempos`, la lógica de `generar_donas_finalizaciones`, `generar_donas_derrotas` y `generar_chart_record_barras`. `clasificar_arquetipo_base` se sustituye por percentiles.

### 6.2 Fuentes de datos

| Fuente | Qué aporta | Cobertura (2026-11-23) | Licencia |
|---|---|---|---|
| [UFC-Almanac](https://github.com/Sam-Armstrong/UFC-Almanac) `data/FightResults.csv`, `FightStats.csv`, `FighterData.csv` (raw de GitHub) | Base: peleas, estadísticas por pelea y perfil de carrera (UFCStats) | 2010-01-02 → 2026-11-14; 7.738 peleas, 2.682 peleadores; actualizada cada semana | MIT |
| Kaggle `jerzyszocik/ufc-fight-forecast-complete-gold-modeling-dataset` (`full_data_silver_plus.parquet`) | Enriquecimiento: división, género, cuotas decimales (`f_*_odds_legacy`), apodo, fecha de nacimiento | 1994-03-11 → 2026-05-16; cuotas en el 77 % | CC0 1.0 (página de Kaggle, 2026-11-23) |
| Kaggle `mdabbert/ultimate-ufc-dataset` (`ufc-master.csv`) | Reserva de cuotas donde jerzyszocik no tenga ninguna de las dos | 2010 → 2026-03-28 | CC BY 4.0 (página de Kaggle, 2026-11-23) |

- **Puerta de licencias (primer paso del corte 1):** leer la licencia de los dos datasets de Kaggle en su página.
  - **Variante A** (permite redistribuir con atribución): todo como está escrito y atribución en el pie de página y el README.
  - **Variante B** (no lo permite o no está clara): `data/raw/enrichment.parquet` no se versiona (va a `data/raw/cache/`, ignorado), los parquet públicos y los JSON no llevan `odds_decimal`, `opp_odds_decimal` ni `implied_prob_fair`, el historial no tiene columna de cuota y la vista de cuotas muestra solo agregados por peleador (ROI y `n` por tipo, victorias reales frente a esperadas). El workflow semanal descarga el enriquecimiento de Kaggle en cada ejecución.
  - La variante elegida se anota en esta sección antes de escribir código.
  - **Elegida: variante A** (2026-11-23). jerzyszocik es CC0 y mdabbert CC BY 4.0: se versiona `data/raw/enrichment.parquet` (≈ 390 KB) y los JSON llevan cuotas. Atribución obligatoria a mdabbert (Matt Dabbert, CC BY 4.0) en el pie y el README; las tres fuentes están en `meta.json.sources`.
- **Cuotas:** americanas → decimales: `1 + A/100` si `A > 0`; `1 + 100/|A|` si `A < 0`. `odds_decimal` y `opp_odds_decimal` de una pelea salen siempre de la misma fuente: jerzyszocik si tiene las dos; si no, mdabbert si tiene las dos; si no, la que tenga la del peleador. `odds_source` registra cuál. `implied_prob_fair = (1/odds) / (1/odds + 1/opp_odds)`, solo con las dos cuotas.

- Cruce Almanac ↔ jerzyszocik por `(fecha, nombre normalizado)` con tolerancia de ±1 día: 98,0 % de coincidencias sobre 7.436 peleas hasta 2026-05-16 (las no emparejadas son casi todas empates y sin resultado, que jerzyszocik no incluye). Normalización: NFKD → ASCII, minúsculas, guiones como espacio, sin el resto de puntuación, espacios colapsados.
- Homónimos (corte 1: solo Bruno Silva): se separan por la URL de UFCStats del enriquecimiento; las peleas sin URL van a la identidad con la pelea emparejada más cercana en el tiempo, y las filas repetidas de `FighterData` a la identidad cuya división se acerca más a su peso. Las peleas sin coincidencia se registran en `data/processed/unmatched.csv` para revisión; no se descartan.
- Peleas posteriores al enriquecimiento (302 a fecha de hoy) y no emparejadas: `weight_class` = la última división conocida del peleador antes de esa pelea; si no hay, se infiere del **peso actual del peleador** (`FighterData.Weight`, no el de la pelea) con los límites oficiales, y `weight_class_inferred = true`; `gender` = el último conocido o `null`; cuotas `null`.
- UFCStats no se scrapea directamente: tiene un reto anti-bots con JavaScript.
- Codificaciones de Almanac:
  - Comprobado: `FightResults.Date` es `DD/M/YYYY`. `FightStats.Time` es el tiempo total transcurrido en segundos (144 en un KO del primer asalto; 900 en una decisión a 3 asaltos; 1500 a 5).
  - Verificado en el corte 1: `Result` 1 = gana Fighter 1, 2 = gana Fighter 2, 3 = empate, 4 = sin resultado (Evans–Silva, Jones–Vera, Edgar–Maynard 2011, «Overturned»). En `FighterData`: `Height` en cm, `Reach` en pulgadas (se convierte a cm), `Weight` en libras (peso actual) y `Stance` 1 = Orthodox, 2 = Southpaw, 3 = Switch (McGregor y Poirier 2, Adesanya 3). Un perfil con las 8 métricas de carrera a 0 se trata como sin datos (`null`).
- Asalto y tiempo del asalto (todas las peleas de la UFC desde 2010 tienen asaltos de 5 min): `round = ceil(fight_time_s / 300)` y `round_time_s = fight_time_s − 300 × (round − 1)`. Si existe `finish_round`/`finish_time` de jerzyszocik y discrepa, se registra en `unmatched.csv` y manda Almanac.
- Rivales sin fila en `FighterData`: se crea su fila en `fighters.parquet` con nombre, slug y lo que se derive de `fights` (división, peleas); el resto de columnas, `null`. Así todo rival existe en el índice.

### 6.3 Contrato del dataset limpio

Lo genera este repositorio (`pipeline.build`); el repositorio de análisis `ufc-fight-analytics` lo consume más adelante copiando `data/processed/*.parquet` (o desde una release). Esto sustituye la decisión anterior de que el análisis generase el dataset.

`fights.parquet` — una fila por peleador y pelea (formato largo):

| Columna | Tipo | Nulos | Origen |
|---|---|---|---|
| `fight_id` | str | no | hash de fecha + nombres ordenados |
| `date` | date | no | Almanac |
| `fighter`, `fighter_slug` | str | no | Almanac; slug estable (ver «Slugs» abajo) |
| `opponent`, `opponent_slug` | str | no | Almanac |
| `result` | `W` / `L` / `D` / `NC` | no | Almanac `Result` |
| `method` | `KO/TKO` / `SUB` / `DEC` / `OTHER` | no | Almanac `Method` agrupado |
| `method_detail` | str | sí | Almanac `Method` |
| `fight_time_s` | int | sí | Almanac `FightStats.Time` (tiempo total) |
| `round`, `round_time_s` | int | sí | derivados de `fight_time_s` (6.2) |
| `odds_source` | `jerzyszocik` / `mdabbert` / null | sí | pipeline |
| `weight_class`, `gender` | str | sí (solo en no emparejadas) | jerzyszocik o inferido (6.2) |
| `weight_class_inferred` | bool | no | pipeline |
| `odds_decimal`, `opp_odds_decimal` | float | sí | jerzyszocik / mdabbert |
| `implied_prob_fair` | float | sí | pipeline (solo si existen las dos cuotas) |
| `kd`, `kd_against`, `sig_landed`, `sig_attempted`, `sig_absorbed`, `str_landed`, `str_attempted`, `str_absorbed`, `td`, `td_attempted`, `taken_down`, `sub_att`, `clinch`, `clinch_taken`, `ground`, `ground_taken` | int | sí | Almanac `FightStats` |

`fighters.parquet` — una fila por peleador (incluidos los rivales sin perfil):
- No nulas: `fighter`, `fighter_slug`, `ufc_fights`, `last_fight_date`.
- Anulables: `nickname`, `dob`, `age` (la de Almanac; la edad mostrada se calcula en el cliente desde `dob`), `height_cm`, `reach_cm`, `weight_lbs`, `stance` (`Orthodox`/`Southpaw`/`Switch`), `wins`, `losses`, `draws` (carrera profesional completa), `slpm`, `str_acc`, `sapm`, `str_def`, `td_avg`, `td_acc`, `td_def`, `sub_avg`, `weight_class` (la más reciente), `gender`, `archetype`.
- Escalas: `str_acc`, `str_def`, `td_acc` y `td_def` en 0–100 (como en Almanac); `implied_prob_fair` en 0–1.

**Slugs:** `kebab-case` ASCII del nombre normalizado. Si dos peleadores distintos comparten slug, se queda sin sufijo el de primera pelea más antigua y los demás reciben `-2`, `-3` en ese orden. `data/processed/slugs.csv` (`fighter_key, slug`, versionado) congela las asignaciones: un slug ya asignado nunca cambia de peleador ni desaparece mientras el peleador exista en la fuente. `fighter_key` = nombre normalizado + fecha de la primera pelea.

Validaciones (`validate.py`; el build falla si no se cumplen):
- Claves únicas (`fight_id` + `fighter_slug`; `fighter_slug`).
- Cada `fight_id` aparece exactamente 2 veces con resultados complementarios (W/L, D/D, NC/NC).
- Integridad: todo `fighter_slug` y `opponent_slug` de `fights` existe en `fighters`; hay exactamente un `fighters/<slug>.json` por entrada de `index.json`; los slugs de `config.ts` existen.
- `slugs.csv`: ninguna asignación anterior cambia.
- Fechas entre 2010-01-01 y hoy; las columnas de porcentaje en [0, 100]; `implied_prob_fair` en [0, 1]; `odds_decimal` > 1.
- Volumen: número de peleas ≥ 99,5 % del `fights` de la `meta.json` versionada (si no hay `meta.json`, se omite). Una caída menor de 0,5 % solo avisa.

JSON para la web:
- `index.json` = `[{slug, name, nickname, weight_class, gender, record: "W-L-D", last_fight}]`.
- `meta.json` = `{data_through, sources, fights, fighters}`. `data_through` es la fecha de la última pelea (el pie de página la muestra como «Data through …»), así que no cambia si no hay peleas nuevas.
- `fighters/<slug>.json` = perfil, métricas, `percentiles: {division, global}` (cada uno con las 8 métricas o `null`), agregados (vías de victoria/derrota, ROI total y por tipo con `n`, duraciones) y la lista de peleas.
- El build es determinista: con las mismas fuentes produce archivos idénticos (sin marcas de tiempo del build).
- Objetivo de tamaño: `index.json` < 300 KB comprimido; cada `fighters/<slug>.json` < 50 KB.

### 6.4 Actualización semanal

`.github/workflows/update-data.yml`: los martes a las 06:00 UTC (y a mano con `workflow_dispatch`) ejecuta `python -m pipeline.build`, corre `pytest` y, si `data/processed/fights.parquet` cambió, hace commit en `main` de `data/` y `web/public/data/` con el mensaje «Update data YYYY-MM-DD». Solo descarga Almanac; el snapshot de enriquecimiento se renueva a mano con `python -m pipeline.refresh_enrichment` cuando Kaggle publique una versión nueva.

- **Dependencias externas y su coste:** GitHub (gratis), Cloudflare Pages (gratis), Kaggle (gratis, sin credenciales para datasets públicos; solo en `refresh_enrichment`).

## 7. Datos, privacidad y seguridad

- Solo datos públicos de deportistas profesionales (nombres, estadísticas, edad). No hay datos de usuarios, formularios ni analítica con cookies.
- Sin secretos: Cloudflare se conecta al repositorio desde su panel; el workflow usa el `GITHUB_TOKEN` por defecto con permiso `contents: write`.
- La web no incrusta contenido de terceros; todo se sirve desde Cloudflare Pages.

## 8. Riesgos y supuestos

| Riesgo o supuesto | Probabilidad | Plan si ocurre |
|---|---|---|
| Licencia de los datasets de Kaggle incompatible con redistribuir datos derivados | Media | Puerta de licencias del corte 1; variante B de la sección 6.2. |
| UFC-Almanac deja de actualizarse o cambia el formato | Media | `validate.py` falla y el workflow no publica; la web sigue con los últimos datos válidos. Fuente alternativa: `neelagiriaditya/ufc-scraper` (MIT). |
| Nombres que no cruzan (2,2 %) o peleadores homónimos | Media | `unmatched.csv` y slugs con sufijo; corrección manual en `pipeline/aliases.csv`. |
| El enriquecimiento envejece (cuotas paradas desde mayo de 2026) | Alta | Se muestra la cobertura de cuotas; ampliar fuentes de cuotas queda fuera de esta versión. |
| 10 h no alcanzan para los 6 cortes | Media | Los cortes 1–3 y el despliegue son el mínimo publicable; 4 y 5 pueden ir después sin bloquear la demo. |
| TypeScript 7 no es compatible con `@astrojs/check` | Media | Usar la versión de TypeScript que fije la plantilla de Astro 7. |

## 9. Preguntas abiertas

- [ ] Dirección visual (referencias, paleta, tipografía) · Piero · al empezar el corte 2 (con `design-taste-frontend`).
- [ ] Par destacado por defecto en la portada · Piero · corte 2.
- [ ] Dominio propio o `*.pages.dev` · Piero · corte 6.

## 10. Revisiones (pez dorado)

| Fecha | Enfoque | Veredicto | Aplicados | Descartados (motivo) |
|---|---|---|---|---|
| 2026-11-23 | Funcionalidad, bordes y contrato de datos (1 revisor) | LISTO CON CAMBIOS | 12/12: asalto y tiempo derivados de `fight_time_s` (comprobado que es tiempo total); percentiles división + global, población, SApM invertido; slugs estables con `slugs.csv`; integridad referencial y filas para rivales sin perfil; nulos de `fighters` y «—» en la ficha (CA6, CA6b); tipos de cuota semiabiertos; fórmula de ROI, `n`, D/NC, fórmula americana→decimal y misma fuente para ambas cuotas; puerta de licencias con variante B definida; reglas de URL (CA5); build determinista (`data_through`, edad en cliente, commit solo si cambia `fights`); validación de volumen leída de `meta.json` con tolerancia 0,5 %; `meta.json` en CA1, escalas de porcentaje, inferencia por peso actual | — |
