'use strict';

function timestamp() {
  return new Date().toISOString();
}

const logger = {
  info(message) {
    console.log(`[${timestamp()}] [INFO] ${message}`);
  },
  ok(message) {
    console.log(`[${timestamp()}] [OK] ${message}`);
  },
  warn(message) {
    console.warn(`[${timestamp()}] [WARN] ${message}`);
  },
  error(message, err) {
    console.error(`[${timestamp()}] [ERROR] ${message}`);
    if (err && err.stack) {
      console.error(err.stack);
    }
  }
};

module.exports = logger;
