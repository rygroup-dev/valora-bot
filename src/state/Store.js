import fs from 'node:fs';
import path from 'node:path';

// Tiny synchronous file-backed key-value store for JWTs, save versions, etc.
export class Store {
  constructor(file = 'data/store.json') {
    this.file = file;
    this._data = {};
    try {
      if (fs.existsSync(file)) this._data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      this._data = {};
    }
  }

  _flush() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this._data, null, 2));
    } catch {
      /* best-effort */
    }
  }

  get(k) {
    return this._data[k] ?? null;
  }
  set(k, v) {
    this._data[k] = v;
    this._flush();
  }
  del(k) {
    delete this._data[k];
    this._flush();
  }
}
