// Lance le serveur Node (API + WebSocket) et Vite en parallèle pour le développement.
import { spawn } from "node:child_process";
const run = (cmd, args) => spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
const server = run("node", ["--watch-path=./server", "--watch-path=./shared", "server/index.js"]);
const vite = run("npx", ["vite"]);
const stop = () => { server.kill(); vite.kill(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
