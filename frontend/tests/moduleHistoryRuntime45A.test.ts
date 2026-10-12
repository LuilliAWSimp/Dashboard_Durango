import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const componentPath = resolve(here, '../src/pages/pozos/components/ModuleHistoryPanel.tsx');
const source = readFileSync(componentPath, 'utf8');

test('ModuleHistoryPanel imports the range policy symbols it executes at runtime', () => {
  assert.match(
    source,
    /import\s*\{[^}]*HISTORY_MAX_RANGE_DAYS[^}]*inclusiveHistoryRangeDays[^}]*\}\s*from\s*['"]\.\.\/historyRangePolicy['"]/s,
  );
  assert.match(source, /const\s+rangeDays\s*=\s*inclusiveHistoryRangeDays\(/);
  assert.match(source, /HISTORY_MAX_RANGE_DAYS\.minute/);
  assert.match(source, /HISTORY_MAX_RANGE_DAYS\.quarter_hour/);
  assert.match(source, /HISTORY_MAX_RANGE_DAYS\.hourly/);
  assert.match(source, /HISTORY_MAX_RANGE_DAYS\.daily/);
});
