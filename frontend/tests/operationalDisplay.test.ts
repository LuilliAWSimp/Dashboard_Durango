import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayOperationalState, isNormalCommunication } from '../src/pages/pozos/operationalDisplay.ts';

test('estado operativo usa etiquetas naturales para el operador', () => {
  assert.equal(displayOperationalState('Apagado con datos'), 'Detenido');
  assert.equal(displayOperationalState('Sin flujo'), 'Detenido');
  assert.equal(displayOperationalState('Activo'), 'En operación');
  assert.equal(displayOperationalState('Operando'), 'En operación');
  assert.equal(displayOperationalState('Sin registros'), 'Sin registros');
});

test('comunicacion normal se puede ocultar y las excepciones permanecen visibles', () => {
  assert.equal(isNormalCommunication('Normal'), true);
  assert.equal(isNormalCommunication('Actualizado'), true);
  assert.equal(isNormalCommunication('En línea'), true);
  assert.equal(isNormalCommunication('Sin comunicación'), false);
  assert.equal(isNormalCommunication('Lectura retrasada'), false);
  assert.equal(isNormalCommunication('Sin lectura'), false);
});
