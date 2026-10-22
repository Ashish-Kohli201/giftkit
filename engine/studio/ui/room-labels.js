// ROOM LABELS: what the things in a gift's room are called, in this gift's own world and look.
// The same lookup the engine uses for the words it reads aloud: skin "shell.<theme>.<key>" > skin "shell.<key>" >
// theme "shell.<key>" > the core default. A desk room has a "Laptop" and a "Record player"; a campsite has a "Tent" and a "Radio".

const COPY_KEY = {
  hero: 'giftTag', hub: 'hub', vault: 'vault', board: 'board', jar: 'jar', light: 'light', scenic: 'scenic',
  'app-music': 'appMusic', 'app-gallery': 'appGallery', 'app-notes': 'appNotes', pet: 'pet', toy: 'toy', 'ambient-a': 'ambientA', 'ambient-b': 'ambientB',
};

// Things with no name of their own in the copy: said in plain words.
const PLAIN = { tally: 'Progress marks' };

const cache = new Map();

/** @returns { Promise<(role: string) => string> } a function from a role id to the name this gift's room uses for it */
export async function roomLabels(theme, skin) {
  const key = `${theme}/${skin}`;
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      const [skinMod, themeMod, contract] = await Promise.all([
        import(`/repo/skins/${skin}/index.js`).catch(() => ({ default: {} })),
        import(`/repo/themes/${theme}/index.js`).catch(() => ({ default: {} })),
        import('/repo/core/contract.js').catch(() => ({ DEFAULT_SHELL_COPY: {} })),
      ]);
      const skinCopy = skinMod.default?.copy ?? {};
      const themeCopy = themeMod.default?.copy ?? {};
      const defaults = contract.DEFAULT_SHELL_COPY ?? {};
      return (role) => {
        if (PLAIN[role]) return PLAIN[role];
        const k = COPY_KEY[role];
        if (!k) return role;
        return skinCopy[`shell.${theme}.${k}`] ?? skinCopy[`shell.${k}`] ?? themeCopy[`shell.${k}`] ?? defaults[k] ?? role;
      };
    })());
  }
  return cache.get(key);
}

/** An icon (from the studio's icon set) that suggests each thing. */
export const ROLE_ICON = {
  hub: 'phone', vault: 'lock', scenic: 'eye', tally: 'check', board: 'image', light: 'sparkle', jar: 'gift', 'app-music': 'music',
  'app-gallery': 'image', 'app-notes': 'letter', pet: 'heart', toy: 'sparkle', 'ambient-a': 'sparkle', 'ambient-b': 'moon',
};
