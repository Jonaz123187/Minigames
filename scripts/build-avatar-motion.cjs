"use strict";
const fs = require("node:fs"),
  path = require("node:path");
const {
  avatarMotion,
  avatarPivots,
  jointTransform,
} = require("../public/economy");
let css =
  "/* Generated from the same joint poses used by SVG previews. Run npm run build:avatars. */\n";
for (const [mode, frames] of Object.entries(avatarMotion)) {
  for (const part of Object.keys(avatarPivots)) {
    const selector = mode === "cheer" ? ".podium-winner " : "";
    const duration = mode === "cheer" ? "1.8s" : "3.6s";
    css += `${selector}.avatar-art .avatar-${part} { transform-box: view-box; transform-origin: 0 0; animation: joint-${mode}-${part} ${duration} steps(1, end) var(--avatar-delay, 0s) infinite; }\n`;
    css += `@keyframes joint-${mode}-${part} {\n`;
    frames.forEach((frame, i) => {
      css += `  ${((i * 100) / frames.length).toFixed(5)}% { transform: ${jointTransform(part, frame[part], true)}; }\n`;
    });
    css += `  100% { transform: ${jointTransform(part, frames[0][part], true)}; }\n}\n`;
  }
}
css +=
  ".pixel-image { animation: none !important; transform: none !important; }\n";
css +=
  '@media (prefers-reduced-motion: reduce) { .avatar-art [class^="avatar-"], .podium-winner .avatar-art [class^="avatar-"] { animation: none; transform: none; } }\n';
fs.writeFileSync(path.join(__dirname, "../public/avatar-motion.css"), css);
