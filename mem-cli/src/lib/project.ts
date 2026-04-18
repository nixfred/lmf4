// Project detection for LMF

import { execSync } from 'child_process';
import { basename, isAbsolute, resolve } from 'path';
import { existsSync, statSync } from 'fs';

/**
 * Validate directory path to prevent command injection
 * Only allows existing directories with safe characters
 */
function validateDirPath(dir: string): string | null {
  // Resolve to absolute path
  const resolved = isAbsolute(dir) ? dir : resolve(dir);

  // Check for shell metacharacters that could enable injection
  // Allow: alphanumeric, /, -, _, ., space (but not at start/end)
  const safePattern = /^[a-zA-Z0-9/_\-. ]+$/;
  if (!safePattern.test(resolved)) {
    return null;
  }

  // Verify it exists and is a directory
  try {
    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      return null;
    }
  } catch {
    return null;
  }

  return resolved;
}

/**
 * Detect project name from git remote or PWD basename
 * Priority: 1. Git remote origin name, 2. PWD basename
 */
export function detectProject(cwd?: string): string | undefined {
  const dir = cwd || process.cwd();

  // Validate directory path to prevent command injection
  const safePath = validateDirPath(dir);
  if (!safePath) {
    // Fall back to basename if path validation fails
    return basename(dir);
  }

  // Try git remote first
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: safePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    // Extract repo name from URL
    // Handles: git@github.com:user/repo.git or https://github.com/user/repo.git
    const match = remote.match(/\/([^/]+?)(\.git)?$/);
    if (match) {
      return match[1];
    }
  } catch {
    // Not a git repo or no remote - fall through to PWD
  }

  // Fall back to PWD basename
  return basename(dir);
}

/**
 * Extract project name from an encoded path like "-home-user-Projects-my-app"
 */
export function extractProjectFromPath(path: string): string {
  // Handle Claude Code's path format: -home-pi-Projects-foo-bar
  const parts = path.split('-');

  // Find "Projects" and take everything after
  const projectsIdx = parts.findIndex(p => p.toLowerCase() === 'projects');
  if (projectsIdx !== -1 && projectsIdx < parts.length - 1) {
    return parts.slice(projectsIdx + 1).join('-');
  }

  // Otherwise just use the last part
  return parts[parts.length - 1] || path;
}
