const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();

const ROM_BASE = '/data/roms';
const PORT = 3000;

const CONSOLES = {
  n64:    { name: 'Nintendo 64',    tag: 'N64',  core: 'n64',    dir: 'n64',    extensions: ['.zip','.n64','.z64','.v64'] },
  segaMD: { name: 'Sega Genesis',   tag: 'GEN',  core: 'segaMD', dir: 'segaMD', extensions: ['.zip','.md','.bin','.gen','.smd'] },
  snes:   { name: 'Super Nintendo', tag: 'SNES', core: 'snes',   dir: 'snes',   extensions: ['.zip','.sfc','.smc'] },
};

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

// ROM files (replaces nginx /roms/ alias)
app.use('/roms', express.static(ROM_BASE));

// Dynamic game library from filesystem
app.get('/api/library', async (req, res) => {
  try {
    const library = [];
    for (const [id, console] of Object.entries(CONSOLES)) {
      const dirPath = path.join(ROM_BASE, console.dir);
      let games = [];
      try {
        games = await scanDir(dirPath, console.extensions);
      } catch { /* directory missing, skip */ }
      library.push({
        id,
        name: console.name,
        tag: console.tag,
        theme: id,
        core: console.core,
        romPath: `/roms/${console.dir}/`,
        games,
      });
    }
    res.json(library);
  } catch (err) {
    res.status(500).json({ error: 'Failed to scan library' });
  }
});

// Recursively scan a directory for ROM files (handles SABnzbd subdirectories)
async function scanDir(dirPath, extensions) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const games = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const subGames = await scanDir(fullPath, extensions);
      for (const g of subGames) {
        g.file = entry.name + '/' + g.file;
        games.push(g);
      }
    } else if (extensions.some(ext => entry.name.toLowerCase().endsWith(ext))) {
      games.push({
        file: entry.name,
        name: cleanName(entry.name),
      });
    }
  }

  return games.sort((a, b) => a.name.localeCompare(b.name));
}

// Clean ROM filename into a display name
function cleanName(filename) {
  return filename
    .replace(/\.(zip|n64|z64|v64|md|bin|gen|sfc|smc)$/i, '')
    .replace(/_ /g, ': ')          // "III_ The" → "III: The" (underscore+space = colon in filenames)
    .replace(/_/g, ' ')            // remaining underscores become spaces
    .replace(/\s*\(.*?\)/g, '')    // strip (USA), (Europe), (Rev A), etc.
    .replace(/\s*\[.*?\]/g, '')    // strip [!], [h1], etc.
    .replace(/\d+\.\d+$/g, '')     // strip trailing version numbers like 1.1
    .replace(/(\d)-(?=[A-Z])/g, '$1: ')  // "2-Diddys" → "2: Diddys"
    .replace(/\s{2,}/g, ' ')       // collapse multiple spaces
    .trim();
}

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Arcade Vault API running on :${PORT}`));
