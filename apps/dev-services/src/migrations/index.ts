import * as migration_20261027_215307_ai_suite_vectors from './20261027_215307_ai_suite_vectors';
import * as migration_20261027_215248_initial from './20261027_215248_initial';

export const migrations = [
  {
    up: migration_20261027_215248_initial.up,
    down: migration_20261027_215248_initial.down,
    name: '20261027_215248_initial'
  },
  {
    up: migration_20261027_215307_ai_suite_vectors.up,
    down: migration_20261027_215307_ai_suite_vectors.down,
    name: '20261027_215307_ai_suite_vectors'
  },
];
