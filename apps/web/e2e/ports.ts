// Ports of their own, so the tests can run while `pnpm dev` is using 3000
// and a local sync server is using 8787.
export const WEB_PORT = 3100;
export const SYNC_PORT = 8788;

// The address is spelled out as 127.0.0.1 so that how "localhost" resolves
// (IPv6 first, on most machines) is not a variable in the tests.
export const LOOPBACK = "127.0.0.1";
export const WEB_ORIGIN = `http://${LOOPBACK}:${WEB_PORT}`;
export const SYNC_HOST = `${LOOPBACK}:${SYNC_PORT}`;
