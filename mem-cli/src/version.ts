// Single source of truth for version — update package.json only
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

let _version = '4.1.0'; // fallback

try {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // Works from both src/ (dev) and dist/ (built)
  for (const rel of ['../package.json', '../../package.json']) {
    try {
      const pkg = JSON.parse(readFileSync(join(__dirname, rel), 'utf-8'));
      if (pkg.version) { _version = pkg.version; break; }
    } catch { /* try next */ }
  }
} catch { /* use fallback */ }

export const VERSION = _version;
export const DISPLAY_NAME = `LMF ${_version.split('.').slice(0, 2).join('.')}`;
