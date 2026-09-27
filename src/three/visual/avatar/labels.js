// Textures dessinées par joueur : dossard (nom + numéro au dos) et étiquette flottante.
import { luminance } from "../util.js";

const FONT = `"Segoe UI", "Helvetica Neue", Arial, sans-serif`;

export function drawDecal(canvas, name, num, backHex, accent) {
  const g = canvas.getContext("2d"), W = canvas.width;
  g.clearRect(0, 0, W, W);
  const dark = luminance(backHex) > 0.55;
  const fill = dark ? "#0b0b12" : "#ffffff";
  g.textAlign = "center"; g.textBaseline = "middle";
  let fs = 34;
  const label = String(name).toUpperCase();
  do { g.font = `900 ${fs}px ${FONT}`; fs -= 2; } while (g.measureText(label).width > W * 0.86 && fs > 14);
  g.fillStyle = fill; g.fillText(label, W / 2, 34);
  g.font = `900 158px ${FONT}`;
  g.lineJoin = "round";
  g.shadowColor = accent; g.shadowBlur = 14;
  g.strokeStyle = accent; g.lineWidth = 10;
  g.strokeText(String(num), W / 2, 150);
  g.shadowBlur = 0;
  g.fillStyle = fill; g.fillText(String(num), W / 2, 150);
}

export function drawLabel(canvas, name, num, accent) {
  const g = canvas.getContext("2d"), W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  g.beginPath();
  g.roundRect ? g.roundRect(4, 14, W - 8, H - 28, 22) : g.rect(4, 14, W - 8, H - 28);
  g.fillStyle = "rgba(6,6,14,0.72)"; g.fill();
  g.lineWidth = 3; g.strokeStyle = "rgba(255,255,255,0.14)"; g.stroke();
  g.fillStyle = accent; g.shadowColor = accent; g.shadowBlur = 12;
  g.fillRect(22, 34, 10, H - 68);
  g.shadowBlur = 0;
  g.textBaseline = "middle"; g.textAlign = "left";
  let fs = 52;
  do { g.font = `800 ${fs}px ${FONT}`; fs -= 2; } while (g.measureText(name).width > W - 170 && fs > 20);
  g.fillStyle = "#ffffff"; g.fillText(name, 48, H / 2 + 2);
  g.textAlign = "right"; g.font = `900 44px ${FONT}`;
  g.fillStyle = accent; g.fillText(`#${num}`, W - 24, H / 2 + 2);
}

// Marqueur au sol : ombre douce (noire) + anneau (teinté par la couleur du matériau)
export function drawMarker(canvas, withBlob) {
  const g = canvas.getContext("2d"), W = canvas.width, c = W / 2;
  g.clearRect(0, 0, W, W);
  if (withBlob) {
    const gr = g.createRadialGradient(c, c, 0, c, c, c * 0.72);
    gr.addColorStop(0, "rgba(0,0,0,0.72)"); gr.addColorStop(0.55, "rgba(0,0,0,0.38)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, W, W);
  }
  const rg = g.createRadialGradient(c, c, c * 0.74, c, c, c * 0.98);
  rg.addColorStop(0, "rgba(255,255,255,0)"); rg.addColorStop(0.35, "rgba(255,255,255,0.85)");
  rg.addColorStop(0.6, "rgba(255,255,255,0.95)"); rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg;
  g.beginPath(); g.arc(c, c, c * 0.98, 0, Math.PI * 2); g.arc(c, c, c * 0.74, 0, Math.PI * 2, true); g.fill();
}
