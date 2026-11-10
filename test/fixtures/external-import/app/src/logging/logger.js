// A scoped logger that appends entries to a sink. The default sink is an
// array, so nothing is printed while tests run.
export function createLogger(scope, { sink = [] } = {}) {
  function write(level, message, data) {
    sink.push(data === undefined ? { level, scope, message } : { level, scope, message, data });
  }

  return {
    info: (message, data) => write('info', message, data),
    warn: (message, data) => write('warn', message, data),
    error: (message, data) => write('error', message, data),
    entries: () => [...sink],
  };
}
