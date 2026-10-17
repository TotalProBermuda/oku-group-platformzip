// Opt-in validation preload only: never imported by the application.
// Allows fixture PostgreSQL and local IPC; fails closed before any external IO.
const net = require("node:net");
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = net._normalizeArgs(args)[0];
  const host = options.host || "localhost";
  if (!options.path && !["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(host)) {
    throw new Error(`Validation blocked external network connection (${host})`);
  }
  return original.apply(this, args);
};
