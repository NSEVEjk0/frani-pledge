// Frani Pledge — campaign archive. One JSON file per campaign, keyed by id.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export class CampaignStore {
  constructor(dir) {
    this.dir = dir;
  }

  async init() {
    if (!existsSync(this.dir)) await mkdir(this.dir, { recursive: true });
  }

  _file(id) {
    const safe = String(id).replace(/[^0-9a-zA-Z_-]/g, '');
    return path.join(this.dir, `${safe}.json`);
  }

  async save(campaign) {
    await this.init();
    campaign.updatedAt = Date.now();
    await writeFile(this._file(campaign.id), JSON.stringify(campaign, null, 2), 'utf8');
    return this._file(campaign.id);
  }

  async get(id) {
    const file = this._file(id);
    if (!existsSync(file)) return null;
    return JSON.parse(await readFile(file, 'utf8'));
  }

  async list() {
    if (!existsSync(this.dir)) return [];
    const names = (await readdir(this.dir)).filter((n) => n.endsWith('.json'));
    const out = [];
    for (const name of names) {
      try {
        out.push(JSON.parse(await readFile(path.join(this.dir, name), 'utf8')));
      } catch {
        /* skip malformed */
      }
    }
    out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return out;
  }
}
