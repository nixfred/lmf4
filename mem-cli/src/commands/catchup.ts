// mem catchup - Extract any unprocessed Claude Code session transcripts.
//
// This command delegates to the SessionExtract hook's --batch mode, which
// scans ~/.claude/projects/ for JSONL transcripts that have not yet been
// extracted and runs the extraction pipeline on each. The hook tracks
// already-extracted transcripts in ~/.claude/MEMORY/.extraction_tracker.json
// so repeated runs are idempotent.
//
// Wired to the memory-catchup.timer systemd unit.

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface CatchupOptions {
  force?: boolean;
}

export async function runCatchup(options: CatchupOptions): Promise<void> {
  const hookPath = join(homedir(), '.claude', 'hooks', 'SessionExtract.hook.ts');

  if (!existsSync(hookPath)) {
    console.error(`SessionExtract hook not found at ${hookPath}`);
    console.error('Install LMF4 first (run ./install from the LMF4 repo) or copy the hook manually.');
    process.exit(1);
  }

  const args = ['run', hookPath, '--batch'];
  if (options.force) args.push('--force');

  console.log(`Running catchup${options.force ? ' (force)' : ''}...`);

  const child = spawn('bun', args, {
    stdio: 'inherit',
    env: process.env,
  });

  await new Promise<void>((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Catchup failed with exit code ${code}`));
    });
    child.on('error', reject);
  });
}
