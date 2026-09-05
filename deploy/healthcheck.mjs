try {
  const response = await fetch('http://127.0.0.1:8080/healthz', { signal: AbortSignal.timeout(3000) });
  const data = await response.json();
  process.exit(response.ok && data.ok === true && data.service === 'Super Pi Hole' ? 0 : 1);
} catch { process.exit(1); }
