#!/usr/bin/env node
import('../dist/cli.js').catch((err) => {
  console.error('Error starting CLI:', err);
  process.exit(1);
});
