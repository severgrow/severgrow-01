// Report the actual assertion in public Actions annotations as well as the signed-in raw log.
// Monitor only: Node retains its normal error handling and nonzero exit status.
process.on('uncaughtExceptionMonitor', error => {
  const detail = error?.stack ?? String(error);
  const escaped = detail.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.error(`::error title=Browser check failure::${escaped}`);
});
