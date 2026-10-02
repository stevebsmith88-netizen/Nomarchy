// A tiny in-memory stand-in for the Supabase query builder, enough for the
// server jobs and routes under test. Records every write in `log`.
export function fakeDb(tables) {
  const log = [];
  const db = {
    tables, log,
    from(name) {
      const q = { f: [], op: "select", limit: null, order: null };
      const rows = () => (db.tables[name] || []).filter((r) => q.f.every((fn) => fn(r)));
      const api = {
        select() { return api; },
        eq(c, v) { q.f.push((r) => r[c] === v); return api; },
        in(c, vs) { q.f.push((r) => vs.includes(r[c])); return api; },
        gt(c, v) { q.f.push((r) => Date.parse(r[c]) > Date.parse(v)); return api; },
        lt(c, v) { q.f.push((r) => Date.parse(r[c]) < Date.parse(v)); return api; },
        not(c) { q.f.push((r) => r[c] !== null && r[c] !== undefined); return api; },
        is(c, v) { q.f.push((r) => (r[c] ?? null) === v); return api; },
        or(expr) {
          const m = String(expr).match(/^(\w+)\.is\.null,\1\.lt\.(.+)$/);
          if (m) q.f.push((r) => !r[m[1]] || Date.parse(r[m[1]]) < Date.parse(m[2]));
          return api;
        },
        order(c, { nullsFirst } = {}) { q.order = { c, nullsFirst }; return api; },
        limit(n) { q.limit = n; return api; },
        single() { q.single = true; return api; },
        update(v) { q.op = "update"; q.vals = v; return api; },
        delete() { q.op = "delete"; return api; },
        upsert(row) {
          log.push(["upsert", name, row]);
          const t = (db.tables[name] ||= []);
          const i = t.findIndex((r) => r.google_place_id === row.google_place_id);
          if (i >= 0) t[i] = row; else t.push(row);
          return Promise.resolve({ error: null });
        },
        then(res, rej) {
          if (!db.tables[name]) return Promise.resolve({ data: null, error: { message: `no table ${name}` } }).then(res, rej);
          let r = rows();
          if (q.op === "update") { r.forEach((x) => Object.assign(x, q.vals)); log.push(["update", name, q.vals, r.length]); return Promise.resolve({ error: null }).then(res, rej); }
          if (q.op === "delete") { db.tables[name] = db.tables[name].filter((x) => !r.includes(x)); log.push(["delete", name, r.length]); return Promise.resolve({ error: null }).then(res, rej); }
          if (q.order) r = [...r].sort((a, b) => (a[q.order.c] ? Date.parse(a[q.order.c]) : -Infinity) - (b[q.order.c] ? Date.parse(b[q.order.c]) : -Infinity));
          if (q.limit) r = r.slice(0, q.limit);
          return Promise.resolve({ data: q.single ? r[0] ?? null : r.map((x) => ({ ...x })), error: null }).then(res, rej);
        },
      };
      return api;
    },
  };
  return db;
}
