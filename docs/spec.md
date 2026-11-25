# Especificación — UFC Fighter Compare

> Fase 1 (Elefante) del Método de trabajo con IA. Debe permitir construir **sin preguntar**: lo que no esté aquí no existe.

Versión: 0.2 · Fecha: 2026-11-23 · Estado: aprobada (Piero, 2026-11-23) · Ampliación v0.8 (§11), decisiones cerradas 2026-11-25

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

### 3.1 Cambios v0.3 (2026-11-23, decididos por Piero tras el laboratorio de componentes)

Sustituyen lo que contradigan de la lista anterior.

- **Composición tipo dashboard en tres columnas**: a la izquierda los datos propios del peleador A, a la derecha los de B, pegados a los bordes; en el centro, los gráficos compartidos. Fondo gris carbón casi monocromo con un resplandor rojo desde el borde izquierdo y azul desde el derecho que se difumina hacia el centro. Sin bordes naranjas ni sombras en los paneles. Barra fija arriba con los dos buscadores y el intercambio.
- **Componentes elegidos** (códigos del laboratorio `/lab-components`):
  - K2 · tira de cifras con «edge» (tasa de victorias, tasa de finalización en la UFC, duración media sin «edge», ROI).
  - T2 · tale of the tape con barra de diferencia hacia quien tiene la ventaja y la diferencia escrita.
  - R1 (centro) · récord en barras en espejo; R3 (columnas propias) · récord grande y forma de las últimas 10 peleas en la UFC.
  - M2 (columnas propias) · barra de reparto por método de victorias, con derrotas debajo; M3 (centro) · victorias y derrotas por método en espejo. Sustituyen a las donas.
  - P1 (centro) · radar superpuesto; P3 (centro) · barras en espejo de los 8 percentiles.
- **Gráficos interactivos traídos de `ufc-fight-analytics/src/app.py`** (ECharts, con detalle al pasar el puntero o tocar): rendimiento por pelea con selector de métrica (golpes significativos por minuto, precisión, derribos, intentos de sumisión), retorno por pelea según el tipo de cuota (forma del punto según el resultado), distribución de la duración de las peleas. El historial de cada uno va en su columna (últimas peleas y desplegable con todas).
- **Perfil por peleador**: página estática `/fighters/<slug>/` por cada entrada del índice, con los componentes de un solo peleador (ficha, cifras, forma, métodos, radar frente a su división, percentiles, rendimiento, retorno, duración e historial completo) y un enlace para compararlo. Los nombres del comparador enlazan a su perfil.
- **Fotos** (decidido 2026-11-24): Wikimedia Commons vía Wikidata (~1 de cada 4 peleadores), en color natural, con crédito (autor, licencia, enlace) tras un © en el retrato; sin foto, monograma.

### 3.2 Módulos (v0.4, 2026-11-23)

Cada bloque es un módulo con nombre interno (`data-module`), una pregunta que responde y sus datos. Ningún dato se muestra en dos módulos de la misma vista. Se abandona el monocromatismo: color por esquina (rojo/azul) y color semántico por tipo de combate (ámbar = golpeo/KO, esmeralda = lucha/sumisión, lavanda = decisión/equilibrado), que también colorea los arquetipos.

| Módulo | Pregunta | Contenido |
|---|---|---|
| `corner.identity` | ¿Quién es? | Nombre (enlace al perfil), apodo, división, arquetipo, esquina. Datos físicos solo si no hay `duel.matchup` en la vista (perfil o un solo lado). |
| `corner.record` | ¿Cómo le va? | Récord profesional, racha actual y forma de toda la carrera (un cuadro por pelea; las UFC desde 2010 se abren en `fight.dialog`, salvo en móvil, donde se abren desde el historial). |
| `corner.finishes` | ¿Cómo terminan sus peleas? | Reparto por método de victorias y derrotas (M2). |
| `corner.history` | ¿Contra quién ha peleado? | Lista de peleas UFC; cada fila entera abre `fight.dialog`. |
| `duel.matchup` | ¿Quién llega mejor? | Tasa de victorias y de finalización con flecha verde/roja (sin «Edge»; sin flecha si la cifra mostrada es igual); tale of the tape con flechas verde/roja en altura y alcance y neutras (gris) en edad y peso, (edad, altura, alcance, peso, guardia) con la diferencia escrita. |
| `duel.style` | ¿Cómo pelea cada uno? | Radar grande con selector de capa (los dos, A, B) y ficha técnica de 8 métricas (percentil y valor real). |
| `fights.performance` | ¿Cómo ha rendido pelea a pelea? | Dispersión por fecha con selector de métrica y de periodo. Fila completa. |
| `fights.returns` | ¿Ha dado dinero apostarle? | Dispersión de retorno por pelea, ROI por tipo de cuota de los dos y victorias reales frente a esperadas, todo según el periodo. Fila completa. Sustituye a la columna de apuestas. |
| `fights.length` | ¿Cuánto duran sus peleas? | Histograma de minutos, media y % a decisión según el periodo. Fila completa. |
| `fight.dialog` | ¿Qué pasó en esa pelea? | Diálogo con fecha, división, método, asalto y tiempo, cuotas y probabilidad justa, retorno de 100 y estadísticas de los dos peleadores; enlaces a la comparación y al perfil del rival. |

Se retiran de la comparación: el bloque central de récord y métodos en espejo (R1 + M3, repetía `corner.record` y `corner.finishes`), la duración media y el ROI de las cifras (viven en `fights.length` y `fights.returns`) y el título visible «A vs B» (queda como h1 para lectores de pantalla).

### 3.3 Arquetipo, especialidades y disciplina (v0.6, 2026-11-23)

- Arquetipo con icono: Striker = guante, Grappler = candado, Balanced = balanza (elegido por Piero).
- Disciplina de base desde el campo «fighting style» de UFC.com vía TidyTuesday 2026-07-07 / {fightr} (`pipeline/styles.py`, snapshot `data/raw/ufc_styles.csv`, 388 peleadores); licencia no declarada, se acredita en el pie. Se descartan etiquetas genéricas (MMA, Freestyle, Striker, Grappler, Brawler).
- Especialidades (`metrics.specialties`, percentiles de su división o globales; se muestran solo las que cumple):

| id | Etiqueta | Regla |
|---|---|---|
| ko_artist | Knockout artist | ≥ 3 victorias UFC por KO/TKO y ≥ 50 % de sus victorias |
| sub_specialist | Submission specialist | ≥ 3 por sumisión y ≥ 40 % |
| heavy_hands | Heavy hands | ≥ 0,5 derribos de golpeo (knockdowns) por pelea, con ≥ 5 peleas con estadísticas |
| fast_starter | Fast starter | ≥ 50 % de victorias en el asalto 1, con ≥ 4 victorias |
| volume_striker | Volume striker | golpes/min ≥ p80 |
| sniper | Sniper | precisión ≥ p80 |
| counter_striker | Counter striker | defensa ≥ p75, precisión ≥ p70 y volumen < p50 |
| brawler | Brawler | volumen ≥ p70 y golpes absorbidos (invertido) ≤ p30 |
| pressure_fighter | Pressure fighter | volumen ≥ p70 y derribos ≥ p60 |
| wrestler | Wrestler | derribos/15 ≥ p80 |
| takedown_wall | Takedown wall | defensa de derribo ≥ p85 |
| hard_to_hit | Hard to hit | defensa de golpeo ≥ p80 |
| iron_chin | Iron chin | ≥ 8 peleas UFC sin derrotas por KO/TKO |
| goes_distance | Goes the distance | ≥ 60 % a decisión, con ≥ 5 peleas |

### Fuera de alcance

- PCA, t-SNE, UMAP, clústeres, correlaciones con cuotas, gráficos globales por división (son del repositorio de análisis `ufc-fight-analytics`).
- Predicciones o modelos de quién ganará.
- Comparar más de dos peleadores.
- Peleas anteriores a 2010 en historial, donas y dispersión (la fuente base empieza en 2010). El récord total sí incluye toda la carrera.
- Cuentas de usuario, backend o base de datos.
- Interfaz en español o bilingüe.

## 4. Criterios de aceptación

- [x] CA1 · Dado el pipeline, cuando ejecuto `python -m pipeline.build`, entonces se generan `data/processed/fights.parquet`, `data/processed/fighters.parquet`, `data/processed/slugs.csv`, `web/public/data/index.json`, `web/public/data/meta.json` y un `web/public/data/fighters/<slug>.json` por entrada del índice, y las validaciones del contrato (sección 6.3) pasan.
- [x] CA2 · Dado `index.json`, cuando lo inspecciono, entonces contiene a todos los peleadores con al menos una pelea en la UFC desde 2010 y ningún `slug` se repite.
- [x] CA3 · Dada la web, cuando escribo «jose aldo» o «JOSÉ ALDO» en el buscador, entonces aparece José Aldo entre las 5 primeras sugerencias.
- [x] CA4 · Dados dos peleadores seleccionados, cuando copio la URL y la abro en otra pestaña, entonces veo la misma comparación.
- [x] CA5 · Dadas las URL `?a=<inexistente>`, `?a=<válido>` (sin `b`), `?a=x&b=x` y `?a=<inexistente>&b=<inexistente>`, cuando las abro, entonces se cumplen las reglas de estado en la URL de la sección 3, sin errores en la consola.
- [ ] CA6 · Dado un peleador sin cuotas, sin estadísticas por pelea, sin perfil de carrera o sin división, cuando lo comparo, entonces la ficha muestra «—» en los campos nulos, cada vista sin datos muestra «No data» con el motivo y el resto de la página funciona.
- [ ] CA6b · Dado cualquier enlace de rival del historial, cuando lo sigo, entonces abre una comparación válida (nunca «Fighter not found»).
- [ ] CA7 · Dado cualquier par, cuando miro la ficha, el récord, el radar, las donas, el historial, la dispersión, la duración y las cuotas, entonces todos se ven y las cifras coinciden con los JSON (comprobado con 3 pares fijos en `pipeline/tests/`).
- [ ] CA8 · Dada la vista de cuotas, cuando hay ROI, entonces se muestra con su `n` y la cobertura; si `n` < 5 en una categoría, se marca «small sample».
- [ ] CA9 · Dado un móvil de 360 px de ancho, cuando recorro la página, entonces no hay desplazamiento horizontal y los gráficos se leen.
- [ ] CA10 · Dada la demo publicada, cuando paso Lighthouse móvil, entonces LCP < 2,5 s, CLS < 0,1 y Accesibilidad ≥ 90.
- [ ] CA11 · Dado el workflow semanal, cuando se ejecuta y `fights.parquet` cambia, entonces hace commit de los datos regenerados y Cloudflare Pages vuelve a publicar; si no cambia, no hace commit; si las validaciones fallan, no hace commit y el workflow queda en rojo.
- [ ] CA12 · Dado el README, cuando lo abro en GitHub, entonces tiene captura, enlace a la demo, fuentes y licencias, método (cruce de fuentes, cuotas sin margen, percentiles), limitaciones y cómo ejecutarlo en local.
- [x] CA13 · Dadas las dependencias, entonces `pipeline/requirements.txt` fija versiones exactas (`==`) y `web/package-lock.json` está versionado.
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
| `title_bout` | bool | no | mdabbert `title_bout` (hasta su último evento) o «Title» en la división de jerzyszocik; incluye títulos interinos si la fuente los marca |
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
- La web no incrusta contenido de terceros salvo las fotos de Wikimedia Commons (miniaturas enlazadas desde upload.wikimedia.org, con crédito y licencia); todo lo demás se sirve desde Cloudflare Pages.

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

- [x] Dirección visual · Piero · 2026-11-23: fondo negro, bordes de los componentes en naranja (#f08c00), y los componentes propios de cada peleador llevan una sombra del color de su esquina (A rojo, B azul). Boceto en el vault: `Proyectos/UFC/UFC - Interfaz.md` y `UFC - Interfaz Descripcion.md`.
- [x] Par destacado por defecto en la portada · Piero · 2026-11-23: Islam Makhachev vs Ilia Topuria (`islam-makhachev`, `ilia-topuria`).
- [ ] Dominio propio o `*.pages.dev` · Piero · corte 6.

## 10. Revisiones (pez dorado)

| Fecha | Enfoque | Veredicto | Aplicados | Descartados (motivo) |
|---|---|---|---|---|
| 2026-11-23 | Funcionalidad, bordes y contrato de datos (1 revisor) | LISTO CON CAMBIOS | 12/12: asalto y tiempo derivados de `fight_time_s` (comprobado que es tiempo total); percentiles división + global, población, SApM invertido; slugs estables con `slugs.csv`; integridad referencial y filas para rivales sin perfil; nulos de `fighters` y «—» en la ficha (CA6, CA6b); tipos de cuota semiabiertos; fórmula de ROI, `n`, D/NC, fórmula americana→decimal y misma fuente para ambas cuotas; puerta de licencias con variante B definida; reglas de URL (CA5); build determinista (`data_through`, edad en cliente, commit solo si cambia `fights`); validación de volumen leída de `meta.json` con tolerancia 0,5 %; `meta.json` en CA1, escalas de porcentaje, inferencia por peso actual | — |
| 2026-11-24 | Interfaz y diseño visual, web en marcha a 1440/768/390 (1 revisor) | LISTO CON CAMBIOS | Orden bajo 1180 px: identidad y récord de A y B, comparación, métodos e historiales; flechas en tasas (sin «Edge»), neutras en edad y peso; badges con anillo de foco, tooltip anclado al borde de su esquina y cierre con Escape, arquetipo con su palabra, 3 especialidades y «+N», disciplina con tooltip; «No data» en el radar y capa desactivada; toques de 44 px en móvil (cuadros de forma como dibujo); capas: el bloque en uso sube sobre sus vecinos (tooltips tapados por el bloque central); forma = toda la carrera; fotos fuera de «Fuera de alcance» | Contraste de las barras de método y color semántico (Piero: colores de esquina, sin cambios); Tab en los cuadros de forma, espejo del nombre, barra a 768 px y tabla de /fighters/ (menores, no pedidos) |
| 2026-11-24 | Diseño (2 revisores: comparación; perfiles, directorio, Method y menús) y pruebas (1 revisor), cortados por tiempo | NO LISTO por poco (comparación); LISTO CON CAMBIOS (perfiles); LISTO CON CAMBIOS provisional (pruebas: suites, tsc y build OK; e2e sin terminar) | Pendiente de decisión de Piero. Ya arreglado antes del informe: récord «null-null-null» en 250 peleadores | — |
| 2026-11-25 | Funcionalidad de la ampliación §11 (1 revisor) | NO LISTO | 12/12: CA15–CA27 y cortes con criterios; reglas de URL, entrada y percentil de grupos; `directory.json` con esquema y límite; casos borde y opciones del índice compuesto; regla de excampeón e interino y validación del CSV; volteo solo en el perfil (§3.2); fotos de Commons reconocidas en §7 y CORS comprobado; salida del PNG, 0 bloques, móvil y carga diferida; validación de 50 KB y plan B; las 13 métricas exactas y «No data»; viewport ≥ 1181×720, color sin arquetipo, bloque de la etiqueta y renombre a v0.8 | — |
| 2026-11-25 | Funcionalidad de §11, ronda 2 (revisor nuevo) | LISTO CON CAMBIOS | 12/12: «mejor» de la tabla de grupos por percentil con SApM invertido; SApM invertido en el índice; casos límite de «Add to group», 4 y repetidos, y Ctrl+K «Compare as group»; contrato `belts`; la primera vista se desplaza si no cabe y CA16 con par de contenido máximo; foco e `inert` del volteo; «primera pelea UFC desde 2010» en lugar de debut; PNG remaquetado a 1200 px, nombres por vista y caída a descarga; percentil de grupos con peleadores sin división o sin datos; órdenes secundarios y desempates; fecha de corte de títulos; validación de `division` e `interim` | — |

## 11. Ampliación v0.8 (revisión de Piero del 2026-11-24)

Origen: nota del vault `Proyectos/UFC/UFC - Revision 24_11_26.md`. Se llama v0.8 para no confundirla con la v0.3 de §3.1; continúa la v0.7 del código. Estado: **decisiones cerradas** (2026-11-25), revisada por el pez dorado en dos rondas (§10): LISTO CON CAMBIOS, cambios aplicados.

### 11.1 Entra en v0.8

| # | Cambio | Definición |
|---|---|---|
| 1 | Radar ↔ tale of the tape | Solo se intercambian sus posiciones en la portada (≥ 1181 px); el contenido no cambia. `alignRadar()` alinea el bloque que quede en cada sitio. |
| 2 | Primera vista | Con viewport ≥ 1181 × 720, todo cabe en la altura de la ventana (unidades `dvh`) salvo la fila de los tres gráficos (rendimiento por pelea, retorno y duración), que queda debajo. Si con un par concreto no cabe, la página se desplaza; nada se recorta. Los historiales tienen scroll interno. Por debajo de ese tamaño, la página se desplaza como ahora. |
| 3 | Grupos | Ventana aparte del cara a cara (`/groups/`) para comparar de 2 a 4 peleadores, cada uno contra los demás (no promedios). Vista: un radar superpuesto con un polígono por peleador, una leyenda con nombre, división y récord, y debajo la tabla de las 8 métricas (una columna por peleador, con el valor real y su percentil). Mejor de cada fila = percentil más alto, con SApM ya invertido; los empates se marcan todos y los «No data» no compiten. **Colores:** dinámicos según la posición en la lista, de una paleta de 4 colores distinguibles sobre negro; no se usan los de esquina. **Percentil:** de división si todos los peleadores con datos comparten división; si no, o si alguno no tiene división, global (los «No data» no cuentan para decidirlo). La leyenda dice cuál. Quien esté fuera de la población sale en la leyenda como «No data», sin polígono. **Entrada:** buscador «Add fighter» en `/groups/` (el mismo buscador de la portada, filtros incluidos), botón «Add to group» en la barra de la comparación (abre `/groups/?f=` con los lados válidos: `?f=a,b`, `?f=a` o `?f=`) y la opción «Compare as group» de la paleta Ctrl+K, que hace lo mismo. Con 4 en la lista, «Add fighter» queda deshabilitado con el aviso «Up to 4 fighters». Un peleador que ya está no se añade. Cada peleador de la lista tiene su botón de quitar. **URL** `?f=slug1,slug2,…`: se quitan duplicados; los slugs inexistentes se descartan con el aviso «Fighter not found: <slug>»; más de 4, se toman los 4 primeros con el aviso «Up to 4 fighters»; con 0–1 válidos, «Add at least 2 fighters» y el radar vacío. |
| 4 | Directorio en carrusel | Sustituye a la tabla de `/fighters/`. **Filtros:** género, división, arquetipo («especialidad general»), especialidades (varias, se combinan con Y) y disciplina («base de pelea»), con un buscador por nombre. Van en la URL (`?gender=&division=&archetype=&spec=a,b&discipline=&sort=&q=`). **Tarjeta (variante B):** retrato o monograma, nombre (enlace al perfil), división, récord, chip de arquetipo, cinturones, SLpM, TDAvg y % de finalización, iconos de especialidad y las últimas 5 peleas UFC en cuadros. **Carrusel:** horizontal con scroll-snap, unas 5 tarjetas visibles a 1440 px y 1,2 a 390 px, flechas anterior/siguiente y teclado. Carga de 24 en 24 al acercarse al final (IntersectionObserver), más un botón «Show more» de respaldo. **Orden por defecto (`sort=best`):** índice compuesto = media de los 8 percentiles de su división, con SApM invertido (100 − p, los mismos del radar); global si no tiene división. Grupos en este orden: (1) ≥ 5 peleas UFC con índice, (2) < 5 peleas con índice, (3) sin percentiles; dentro de cada grupo, índice descendente y desempate por nombre (el grupo 3, por nombre). **Otros órdenes:** victorias UFC desde 2010, % de victorias UFC desde 2010 (descendentes), pelea más reciente y nombre. Los nulos van al final y en todos los órdenes se desempata por nombre. **Sin resultados:** «No fighters match these filters» y botón para limpiar los filtros. **Datos:** `directory.json`, generado por el pipeline y cargado solo en `/fighters/`, con un objeto por peleador (slug, nombre, género, división, récord, arquetipo, especialidades, disciplina, foto, cinturones, las tres cifras, índice, número de peleas UFC, última pelea y las últimas 5 peleas). Límite: < 300 KB comprimido; `index.json` no cambia. |
| 7a | Cinturones de campeón | Un cinturón por división, junto al retrato. Colores: **oro** para el campeón vigente, **plata** para el interino vigente y **gris metálico** para el excampeón. El tooltip dice cuál y en qué división. **Fuentes:** vigentes e interinos vigentes de `data/raw/champions.csv` (`division, slug, interim, since`), mantenido a mano. Excampeón = ganó al menos un `title_bout` en esa división (desde 2010; datos de títulos completos hasta 2026-03-28, la fecha de corte que citan Método y el README, y solo los que marque jerzyszocik hasta 2026-05-16) y no figura como vigente en esa división en el CSV. `title_bout` no distingue los interinos, así que los exinterinos cuentan como excampeones. **Contrato:** `belts: [{division, kind: "champion"|"interim"|"former"}]` en `fighters/<slug>.json` y en `directory.json` (lista vacía si no tiene). **Validaciones:** todo slug del CSV existe; `division` pertenece a los valores de `weight_class`; `interim` es booleano; como máximo un vigente y un interino por división. Método y el README explican el corte de fechas. |
| 7b | Gráfico de carrera | En `/fighters/<slug>/`, sustituye al gráfico de rendimiento por pelea del perfil, así que no se duplica. Es una línea suave con área degradada, línea de media y punto activo al pasar el ratón, como la «Tendencia» de LifeOS (`LifeOS/src/modules/planner/components/habit-board.tsx`). Eje X: peleas UFC en orden cronológico; cada punto abre `fight.dialog`. **Selector con 13 métricas por pelea:** golpes significativos conectados, recibidos y su precisión (`sig_landed/sig_attempted`), golpes totales conectados y recibidos, knockdowns a favor y en contra, derribos, su precisión (`td/td_attempted`) y derribos sufridos, intentos de sumisión, golpes en clinch y en el suelo. Las peleas sin estadísticas o sin intentos (precisión) cortan la línea. Con menos de 2 peleas con dato: «No data». |
| 8 | Perfil que se voltea | En todo `corner.identity`: las dos esquinas de la portada y `/fighters/<slug>/` (decisión de Piero, 2026-11-25). **Duplicados (§3.2, Piero 2026-11-25):** en la comparación, el reverso omite lo que ya muestra el tale of the tape (edad, altura, alcance, peso y guardia); en el perfil sale todo. Un botón en `corner.identity` lo gira en 3D (fundido con `prefers-reduced-motion`) y el reverso ocupa el mismo espacio con el material de los demás bloques. **Reverso:** arquetipo y su regla, disciplina, todas las especialidades con su regla, cinturones por división y datos personales (edad y fecha de nacimiento, altura, alcance, peso, guardia, división, primera pelea UFC desde 2010 con esa etiqueta y última pelea UFC). Accesible: el botón queda fuera de las dos caras, tiene `aria-pressed` y conserva el foco al girar. Solo la cara visible está sin `inert`, y Escape vuelve a la cara con el foco en el botón. |
| 9 | Exportar por componentes | La herramienta «Export image» entra en un modo «seleccionar»: cada bloque muestra una casilla y aparece una barra con «Export» (deshabilitado con 0 bloques) y «Cancel». Cada bloque marcado se clona y se maqueta a 1200 px de ancho (los gráficos ECharts se redibujan a ese ancho), y se apilan en su orden de la página, con una cabecera (título de la vista) y un pie («ufc-fighter-compare · Data through …» y la URL). **Formato:** PNG a escala 2, ancho fijo de 1200 px **Vistas y nombre del archivo:** comparación `ufc-<a>-vs-<b>.png` (con un solo lado, `ufc-<slug>.png`), perfil `ufc-<slug>.png` y grupos `ufc-group-<slug1>-<slug2>….png`; `/fighters/` no exporta. En el móvil se comparte el archivo con `navigator.share` si se puede. Si `share` lanza un error que no sea `AbortError` (cancelar), se descarga. **Librería:** de captura del DOM, cargada solo al entrar en el modo seleccionar, para no afectar al LCP (CA10). Las fotos de Commons se piden con `crossorigin="anonymous"` (upload.wikimedia.org responde `Access-Control-Allow-Origin: *`); si alguna falla, se usa el monograma. `lib/card.ts` se retira. |
| 10a | Color de arquetipo en el perfil | `/fighters/<slug>/` usa el color de su arquetipo (Striker #d48a12, Grappler #1f9e6b, Balanced #7d63d8) donde ahora usa el naranja «solo». Sin arquetipo, sigue en naranja #f08c00. |
| 12 | Diálogo de pelea ampliado | Diálogo más grande con todo lo que hay en `fights.parquet` para esa pelea: las 16 columnas de estadísticas de ambos lados, cuotas de ambos, título, método y detalle, asalto y tiempo, y división. Los campos nulos muestran «—». **Tamaño:** `validate.py` hace fallar el build si algún `fighters/<slug>.json` pasa de 50 KB sin comprimir (hoy el mayor, `jim-miller`, pesa 18 KB). Si se supera, plan B: `fights/<fight_id>.json` cargado al abrir el diálogo. |
| — | Etiqueta de alcance | `corner.finishes` dice «UFC since 2010» bajo su título; ninguna fuente tiene el método de las peleas de fuera de la UFC. |

### 11.2 Para otro avance (definir antes)

- Calculadora sobre el gráfico de ROI.
- Prime frente a momento actual.
- Victorias y derrotas por método en toda la carrera (no hay fuente).
- Mapa corporal de golpes (cabeza, cuerpo, piernas) y acciones por momento de la pelea: ninguna fuente actual tiene objetivos de golpe ni datos por asalto. Primero hay que investigar fuentes (UFCStats u otro dataset).

### 11.3 Criterios de aceptación v0.8

- [ ] CA15 · Dada la portada a ≥ 1181 px, cuando la abro, entonces el radar ocupa el sitio del tale of the tape y viceversa, y siguen alineados el inicio del bloque central con el récord y su final con el de los historiales.
- [ ] CA16 · Dados los viewports 1280×720, 1440×900 y 1920×1080, cuando abro la portada con el par destacado, entonces todos los bloques salvo la fila de los tres gráficos caben sin desplazar la página, y el historial se desplaza por dentro. Con un par de contenido máximo (apodos largos, «+N» especialidades, sin foto), nada se recorta ni se solapa.
- [ ] CA17 · Dadas las URL `/groups/?f=a,b,c`, `?f=a,a,b`, `?f=a,b,c,d,e`, `?f=a,<inexistente>,b` y `?f=a`, cuando las abro, entonces se cumplen las reglas de URL del punto 3, sin errores en la consola. Con divisiones mixtas, la leyenda dice «vs all fighters».
- [ ] CA18 · Dada una comparación A/B, cuando pulso «Add to group» y añado a un tercero desde el buscador, entonces la URL de `/groups/` refleja los 3 y al reabrirla veo el mismo grupo.
- [ ] CA19 · Dado `/fighters/`, cuando filtro por arquetipo Grappler y la especialidad de sumisión, entonces solo aparecen tarjetas que cumplen ambos filtros, en el orden por defecto del punto 4. Al recargar, los filtros se conservan desde la URL. Con filtros sin resultados se ve el estado vacío.
- [ ] CA20 · Dado `directory.json`, cuando lo inspecciono, entonces tiene una entrada por peleador de `index.json`, el índice coincide con la media de sus percentiles (test en `pipeline/tests/`) y pesa < 300 KB comprimido.
- [ ] CA21 · Dado `champions.csv` con un vigente y un interino, cuando miro su ficha y la de un excampeón de esa división, entonces ven oro, plata y gris respectivamente. Un slug inexistente en el CSV hace fallar el build.
- [ ] CA22 · Dado un perfil con ≥ 2 peleas con estadísticas, cuando cambio la métrica del gráfico de carrera, entonces la línea y la media se redibujan con los valores del JSON. Con < 2 peleas con dato, se ve «No data».
- [ ] CA23 · Dado un bloque de identidad (perfil o cualquier esquina de la comparación), cuando pulso el botón de volteo (o Escape con el reverso abierto), entonces gira y muestra los campos del reverso que tocan en esa vista (en la comparación, ninguno de los del tale of the tape), o vuelve a la cara, con el foco en el botón. Con `prefers-reduced-motion` funde en lugar de girar, y la cara oculta no recibe foco con Tab.
- [ ] CA24 · Dado el modo seleccionar con 2 bloques marcados, cuando exporto, entonces obtengo un PNG de 1200 px de ancho a escala 2 con esos bloques, la cabecera y el pie. Con 0 bloques, «Export» está deshabilitado. La librería no se descarga hasta entrar en el modo.
- [ ] CA25 · Dada cualquier pelea UFC del récord o del historial, cuando abro el diálogo, entonces muestra todos los campos del punto 12 de ambos lados, con «—» en los nulos. Ningún `fighters/<slug>.json` pasa de 50 KB.
- [ ] CA26 · Dado un perfil de cada arquetipo y uno sin arquetipo, cuando lo abro, entonces usa el color de su arquetipo o el naranja.
- [ ] CA27 · Dadas las páginas nuevas o cambiadas a 360 px, entonces no hay desplazamiento horizontal (CA9), y Lighthouse móvil de `/fighters/` cumple CA10.

### 11.4 Cortes

| Corte | Qué se puede enseñar al terminarlo | Criterios |
|---|---|---|
| 1. Datos y diálogo | Diálogo ampliado, cinturones de tres colores y etiqueta «UFC since 2010». | CA21, CA25 |
| 2. Portada | Radar y tale of the tape intercambiados; primera vista en una pantalla. | CA15, CA16 |
| 3. Perfil | Color de arquetipo, volteo 3D (perfil y esquinas de la portada) y gráfico de carrera. | CA22, CA23, CA26 |
| 4. Directorio | `directory.json` y carrusel con filtros y orden. | CA19, CA20, CA27 (parcial) |
| 5. Grupos | `/groups/` con radar superpuesto, tabla y entradas. | CA17, CA18 |
| 6. Exportar | Modo seleccionar y PNG por componentes. | CA24, CA27 |

### 11.5 Decisiones v0.8

- [x] Grupos · Piero · 2026-11-25: radar superpuesto, hasta 4 peleadores, colores dinámicos (sin colores de esquina).
- [x] Tarjeta · Piero · 2026-11-25: variante B; orden de mejor a peor por índice compuesto.
- [x] Gráfico de carrera · Piero · 2026-11-25: todas las métricas compatibles, con selector.
- [x] Campeón · Piero · 2026-11-25: oro vigente, plata interino, gris excampeón.
- [x] Exportar · Piero · 2026-11-25: modo «seleccionar» con casillas.
- [x] Volteo · Piero · 2026-11-25: giro 3D.
- [ ] Por aprobar en su corte (lo propone el Elefante antes de aplicarlo): paleta exacta de los 4 colores de grupos, librería de captura, aspecto de los tres cinturones y diseño de la tabla de grupos y de las flechas del carrusel.
- Supuestos del Elefante tras el pez dorado (Piero puede cambiarlos): grupos desde 2 peleadores (no 3) con tabla de métricas bajo el radar; entrada por buscador, «Add to group» y Ctrl+K; filtros del directorio en la URL; carga automática con «Show more»; PNG 1200 px ×2 con cabecera y pie; volteo en la comparación y en el perfil (Piero); el gráfico de carrera sustituye al de rendimiento del perfil.
