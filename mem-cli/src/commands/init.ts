// mem init command

import { initDb } from '../db/connection.js';

export function runInit(): void {
  const { created, path } = initDb();

  if (created) {
    console.log(`✓ Created database at ${path}`);
  } else {
    console.log(`✓ Database already exists at ${path} (schema updated)`);
  }
}
