import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relativePath: string) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const review = read('src/pages/pozos/sections/RevisionDiariaSection.tsx');
const shifts = read('src/pages/pozos/components/ShiftConsumptionPanel.tsx');
const css = read('src/styles/pages/revision-diaria.css');

test('Revision diaria 34 elimina copy tecnico de la cabecera y detalle', () => {
  assert.match(review, /Datos operativos del \$\{selectedDateText\}/);
  assert.doesNotMatch(review, /Fuente diaria única/);
  assert.doesNotMatch(review, /mismo contrato \[T0,T1\)/);
  assert.match(review, /Periodo: \$\{selectedDateText\} · 00:00–23:59/);
});

test('Revision diaria 34 separa volumenes fisicos y elimina subtotal transversal', () => {
  assert.match(review, /label="Pozos"/);
  assert.match(review, /label="Líneas"/);
  assert.match(review, /label="Lavadoras"/);
  assert.match(review, /label="Jarabes"/);
  assert.doesNotMatch(review, /label="Volumen validado"/);
  assert.doesNotMatch(review, /Subtotal de elementos con volumen confiable/);
});

test('Revision diaria 34 concentra estados en actividad y atencion', () => {
  assert.match(review, /label="Con actividad"/);
  assert.match(review, /label="Con atención"/);
  assert.match(review, /attentionCount = reviewCount \+ noDataCount/);
  assert.doesNotMatch(review, /label="Con flujo al cierre"/);
  assert.doesNotMatch(review, /label="Sin actividad"/);
  assert.doesNotMatch(review, /Revisión \/ cobertura parcial/);
});

test('Revision diaria 34 muestra comparativos con fechas explicitas', () => {
  assert.match(review, /Comparativo de volumen/);
  assert.match(review, /Día anterior · \{displayDate\(previousDayDate\)\}/);
  assert.match(review, /Semana anterior · \{displayDate\(previousWeekDate\)\}/);
  assert.match(review, /operationalVolume\(previousDay, 'lavadoras'\)/);
  assert.match(review, /operationalVolume\(previousWeek, 'jarabes'\)/);
});

test('Revision diaria 34 limpia encabezados de la tabla operativa', () => {
  assert.match(review, /Estado al cierre/);
  assert.match(review, /Totalizador inicial/);
  assert.match(review, /Totalizador final/);
  assert.match(review, /Estado de datos/);
  assert.match(review, /Cobertura de datos/);
  assert.match(review, /Última lectura/);
  assert.doesNotMatch(review, /<th>Apertura<\/th>/);
  assert.doesNotMatch(review, /qualityReason\(/);
  assert.doesNotMatch(review, /revisión diaria conciliada/);
  assert.match(review, /Sin volumen disponible/);
});

test('Revision diaria 34 permite subtitulo claro de turnos y conserva modo claro', () => {
  assert.match(shifts, /subtitle\?: string/);
  assert.match(shifts, /subtitle \?\? `Turnos del \${dateLabel\(selectedDate\)}`/);
  assert.match(review, /subtitle=\{`Turnos del \$\{selectedDateText\}`\}/);
  assert.match(css, /daily-review-comparison-panel/);
});

test('polling de Revision diaria respeta cache y no fuerza refresh', () => {
  assert.match(review, /useAutoRefresh\(selectedDate === todayInputDate\(\), \(\) => \{ void load\(false\); \}\)/);
});
