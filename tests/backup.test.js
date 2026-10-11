// Sauvegardes serveur : copie datée quotidienne, rotation BACKUP_KEEP, fichier corrompu, /api/health.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDb, runBackup, latestBackup } from "../server/db.js";
import { createServer } from "../server/index.js";

const day = i => new Date(Date.UTC(2026, 0, 1 + i));

async function tmp(t) {
  const d = await mkdtemp(path.join(tmpdir(), "ll-backup-"));
  t.after(() => rm(d, { recursive: true, force: true }));
  return d;
}
const backupDir = file => path.join(path.dirname(file), "backups");

test("copie datée par jour : 9 jours → 7 copies, contenu identique", async t => {
  const dir = await tmp(t);
  const file = path.join(dir, "lableague.json");
  const content = JSON.stringify({ version: 1, users: { a: { pseudo: "A" } }, sessions: {}, matches: [] });
  await writeFile(file, content);
  for (let i = 0; i < 9; i++) {
    const r = await runBackup(file, { now: day(i), keep: 7 });
    assert.equal(r.name, `lableague-2026-01-${String(i + 1).padStart(2, "0")}.json`);
    assert.equal(r.date, `2026-01-${String(i + 1).padStart(2, "0")}`);
  }
  const files = (await readdir(backupDir(file))).sort();
  assert.deepEqual(files, [3, 4, 5, 6, 7, 8, 9].map(i => `lableague-2026-01-0${i}.json`), "les 7 derniers jours sont conservés");
  assert.equal(await readFile(path.join(backupDir(file), files.at(-1)), "utf8"), content, "copie à l'identique");
  // une deuxième copie le même jour n'en crée pas de nouvelle
  const again = await runBackup(file, { now: day(8), keep: 7 });
  assert.equal(again.created, false);
  assert.equal((await readdir(backupDir(file))).length, 7);
  // aucun fichier étranger au motif n'est effacé par la rotation
  await writeFile(path.join(backupDir(file), "note.txt"), "x");
  await runBackup(file, { now: day(9), keep: 1 });
  assert.deepEqual((await readdir(backupDir(file))).sort(), ["lableague-2026-01-10.json", "note.txt"]);
});

test("fichier principal illisible au démarrage : message indique la dernière copie, rien n'est écrasé", async t => {
  const dir = await tmp(t);
  const file = path.join(dir, "lableague.json");
  await writeFile(file, JSON.stringify({ version: 1, users: {}, sessions: {}, matches: [] }));
  await runBackup(file, { now: day(0), keep: 7 });
  const corrupt = "{ corrompu !!!";
  await writeFile(file, corrupt);
  await assert.rejects(openDb(file), e => {
    assert.match(e.message, /lableague-2026-01-01\.json/, "la dernière copie est nommée");
    return true;
  });
  assert.equal(await readFile(file, "utf8"), corrupt, "le fichier corrompu n'est pas écrasé");
  assert.deepEqual(await readdir(backupDir(file)), ["lableague-2026-01-01.json"], "les copies sont intactes");
  // sans aucune copie, le message le dit
  const dir2 = path.join(dir, "vide");
  const file2 = path.join(dir2, "lableague.json");
  await mkdir(dir2, { recursive: true });
  await writeFile(file2, corrupt);
  await assert.rejects(openDb(file2), /aucune copie/);
});

test("latestBackup : plus récente d'abord, null sinon", async t => {
  const dir = await tmp(t);
  const file = path.join(dir, "db.json");
  assert.equal(await latestBackup(file), null);
  await writeFile(file, "{}");
  await runBackup(file, { now: day(0) });
  await runBackup(file, { now: day(2) });
  assert.equal(await latestBackup(file), "db-2026-01-03.json");
});

test("openDb copie au démarrage et /api/health expose la date (jamais de chemin)", async t => {
  const dir = await tmp(t);
  const file = path.join(dir, "db.json");
  const app = await createServer({ port: 0, host: "127.0.0.1", dataFile: file, log: () => {} });
  t.after(() => app.close());
  const today = new Date().toISOString().slice(0, 10);
  assert.deepEqual(await readdir(backupDir(file)), [`db-${today}.json`], "copie du jour faite au démarrage");
  const h = await fetch(`http://127.0.0.1:${app.port}/api/health`).then(r => r.json());
  assert.equal(h.backup, today, "date de la dernière copie exposée");
  assert.ok(!/[\\/]/.test(h.backup), "jamais de chemin absolu");
});
