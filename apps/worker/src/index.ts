const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);
console.log(JSON.stringify({ level: "info", service: "pedidos-worker", message: "Worker iniciado", intervalMs }));
setInterval(() => {
  console.log(JSON.stringify({ level: "debug", service: "pedidos-worker", job: "orders.expire-scan", at: new Date().toISOString(), mock: true }));
}, intervalMs);
