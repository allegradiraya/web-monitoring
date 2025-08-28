import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Users, ClipboardList, Target as TargetIcon, Lock, Unlock, Plus, Shield, CheckCircle2, X, Download, RefreshCcw } from "lucide-react";

/* =========================================================
   TYPES
========================================================= */
export type Person = {
  id: string;
  name: string;
  role: string;
  unit: "MBM" | "BOS" | "SOCIAL" | "SGK" | "LEAD";
};

export type Achievement = {
  id: string;
  personId: string;
  product: string;
  amount: number;
  date: string; // YYYY-MM-DD
};

type ProductType = "money" | "unit";
type ProductConfig = { name: string; type: ProductType };
type AllowedMap = Record<string, Record<string, boolean>>;
type TargetsPP = Record<string, Record<string, number>>;

/* =========================================================
   DEFAULT DATA + HELPERS (localStorage helpers)
========================================================= */
const uid = () => Math.random().toString(36).slice(2, 9);

const DEFAULT_ORG: Person[] = [
  { id: "lead-1", name: "Branch Manager — Sukamara", role: "BM", unit: "LEAD" },
  { id: "mbm-1", name: "Micro Banking Manager", role: "MBM", unit: "MBM" },
  { id: "sgp-dodi", name: "Dodi", role: "SGP", unit: "MBM" },
  { id: "sgp-ramadiansyah", name: "Ramadiansyah", role: "SGP", unit: "MBM" },
  { id: "sgp-randi", name: "Randi", role: "SGP", unit: "MBM" },
  { id: "bos-1", name: "Branch Operasional Supervisor", role: "BOS", unit: "BOS" },
  { id: "teller-veronika", name: "Veronika", role: "Teller", unit: "BOS" },
  { id: "cs-mulyati", name: "Mulyati Mukhtar", role: "Customer Service", unit: "BOS" },
  { id: "sec-shofiyani", name: "Shofiyani", role: "Security", unit: "BOS" },
  { id: "sec-dede", name: "Dede Rahul", role: "Security", unit: "BOS" },
  { id: "social-suci", name: "Suci", role: "Bansos", unit: "SOCIAL" },
  { id: "social-aisyah", name: "Aisyah", role: "Bansos", unit: "SOCIAL" },
  { id: "sgk-galih", name: "Galih Putra", role: "SGK", unit: "SGK" },
];

const K_ORG = "tm_org_v1";
const K_ACH = "tm_achievements"; // dipakai hanya untuk migrasi lama -> DB
const K_PINOK = "tm_pin_ok";
const K_TGT_PP = "tm_targets_pp";
const K_FP = "tm_featured_products_v2";
const K_ALLOWED = "tm_allowed_products_v1";

const load = <T,>(k: string, def: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : def; } catch { return def; }
};
const save = (k: string, v: any) => localStorage.setItem(k, JSON.stringify(v));

const today = () => new Date().toISOString().slice(0, 10);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const nfmt = (n: number) => n.toLocaleString();

function sumByPerson(achs: Achievement[]) {
  const map = new Map<string, number>();
  for (const a of achs) map.set(a.personId, (map.get(a.personId) || 0) + (Number(a.amount) || 0));
  return map;
}
const byUnit = (unit: Person["unit"]) => (p: Person) => p.unit === unit && !p.role.match(/MBM|BOS|BM/);

function buildPersonProductIndex(achs: Achievement[]) {
  const idx = new Map<string, Map<string, number>>();
  for (const a of achs) {
    if (!idx.has(a.personId)) idx.set(a.personId, new Map());
    const m = idx.get(a.personId)!;
    m.set(a.product, (m.get(a.product) || 0) + (Number(a.amount) || 0));
  }
  return idx;
}
const getPP = (ppIdx: Map<string, Map<string, number>>, personId: string, product: string) =>
  Number(ppIdx.get(personId)?.get(product) || 0);

const getTarget = (targets: TargetsPP, personId: string, product: string) =>
  Number(targets?.[personId]?.[product] || 0);

const MICRO_INCLUDED_PRODUCTS = ["KUR", "KUM"];
function unitTotalForProducts(
  ach: Achievement[],
  unit: Person["unit"],
  products: string[],
  org: Person[]
) {
  const set = new Set(products.map((s) => s.toLowerCase()));
  return ach.reduce((sum, a) => {
    const person = org.find((p) => p.id === a.personId);
    if (!person) return sum;
    if (person.unit !== unit) return sum;
    if (/(MBM|BOS|BM)/.test(person.role)) return sum;
    if (!set.has(a.product.toLowerCase())) return sum;
    return sum + (Number(a.amount) || 0);
  }, 0);
}

/* =========================================================
   SMALL UI ATOMS
========================================================= */
const Btn = ({
  children, onClick, className = "", title, type = "button" as "button" | "submit", disabled
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`px-3 py-2 rounded-xl border transition
      bg-slate-900 border-slate-800 text-white hover:bg-slate-800
      disabled:opacity-60 disabled:cursor-not-allowed
      ${className}`}
  >
    {children}
  </button>
);

const Stat = ({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) => (
  <div className="p-4 rounded-2xl bg-white border shadow-sm">
    <div className="flex items-center gap-3">
      <div className="p-2 bg-slate-100 rounded-xl">{icon}</div>
      <div>
        <div className="text-xl font-semibold">{value}</div>
        <div className="text-slate-500 text-sm">{label}</div>
      </div>
    </div>
  </div>
);

const Section = ({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) => (
  <div className="p-4 rounded-2xl bg-white border overflow-hidden">
    <div className="flex items-center justify-between mb-3">
      <div className="font-semibold">{title}</div>
      {extra}
    </div>
    {children}
  </div>
);

function PBar({ value, target }: { value: number; target: number }) {
  if (!target || target <= 0) return <div className="text-[11px] text-slate-400">—</div>;
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-2 bg-indigo-600" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-slate-600 whitespace-nowrap">{pct}%</span>
    </div>
  );
}

/* =========================================================
   TABLE CELLS
========================================================= */
function ProductCell({ value, target, isMoney }: { value: number; target: number; isMoney: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-right text-sm">{isMoney ? nfmt(value) : value}</div>
      <PBar value={value} target={target} />
    </div>
  );
}

function PersonRow({
  p, ppIdx, targets, productConfigs, allowed
}: {
  p: Person;
  ppIdx: Map<string, Map<string, number>>;
  targets: TargetsPP;
  productConfigs: ProductConfig[];
  allowed: AllowedMap;
}) {
  return (
    <tr className="border-t align-top">
      {/* sticky left cols */}
      <td className="p-2 font-medium min-w-[220px] sticky left-0 bg-white z-10">{p.name}</td>
      <td className="p-2 text-slate-600 min-w-[140px] sticky left-[220px] bg-white z-10">{p.role}</td>

      {productConfigs.map(cfg => {
        const isAllowed = !!allowed?.[p.id]?.[cfg.name];
        if (!isAllowed) return (
          <td key={cfg.name} className="p-2 align-top text-slate-400 min-w-[160px]">—</td>
        );
        const val = getPP(ppIdx, p.id, cfg.name);
        const tgt = getTarget(targets, p.id, cfg.name);
        const isMoney = cfg.type === "money";
        return (
          <td key={cfg.name} className="p-2 align-top min-w-[160px]">
            <ProductCell value={val} target={tgt} isMoney={isMoney} />
          </td>
        );
      })}
    </tr>
  );
}

/* =========================================================
   HELPERS: visible columns & CSV
========================================================= */
function visibleProductsForUnit(
  people: Person[],
  productConfigs: ProductConfig[],
  allowed: AllowedMap
): ProductConfig[] {
  return productConfigs.filter(cfg =>
    people.some(p => !!allowed?.[p.id]?.[cfg.name])
  );
}

function visibleProductsForAll(
  people: Person[],
  productConfigs: ProductConfig[],
  allowed: AllowedMap
): ProductConfig[] {
  // union dari semua produk yang diizinkan minimal oleh 1 pegawai
  const set = new Set<string>();
  people.forEach(p => {
    productConfigs.forEach(cfg => {
      if (allowed?.[p.id]?.[cfg.name]) set.add(cfg.name);
    });
  });
  return productConfigs.filter(cfg => set.has(cfg.name));
}

function makeCSV(rows: any[], headers: string[]) {
  const esc = (v: any) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
    };
  return [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");
}

/* =========================================================
   API helpers (Neon)
========================================================= */
async function apiGetAchievements(from?: string, to?: string): Promise<Achievement[]> {
  const qs = from && to ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : "";
  const r = await fetch(`/api/achievements${qs}`, { cache: "no-store" });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "failed");
  return (j.rows as any[]).map(row => ({
    id: row.id,
    personId: row.person_id,
    product: row.product,
    amount: Number(row.amount),
    date: row.date.slice(0, 10),
  }));
}
async function apiPostAchievement(a: Omit<Achievement, "id">) {
  const r = await fetch("/api/achievements", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error);
  return j.row as { id: string; person_id: string; product: string; amount: number; date: string };
}
async function apiDeleteAchievement(id: string) {
  const r = await fetch(`/api/achievements?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error);
}
async function apiSyncPersons(persons: Person[]) {
  await fetch("/api/persons", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ persons }),
  });
}

/* =========================================================
   OVERVIEW — DIGABUNG 1 TABEL
========================================================= */
function Overview({
  ach, unitTotal, targets, productConfigs, allowed, org
}: {
  ach: Achievement[];
  unitTotal: (u: Person["unit"]) => number;
  targets: TargetsPP;
  productConfigs: ProductConfig[];
  allowed: AllowedMap;
  org: Person[];
}) {
  const ppIdx = useMemo(() => buildPersonProductIndex(ach), [ach]);
  const microKURKUM = useMemo(
    () => unitTotalForProducts(ach, "MBM", MICRO_INCLUDED_PRODUCTS, org),
    [ach, org]
  );

  const peopleAll = useMemo(
    () => org.filter(p => p.unit !== "LEAD"),
    [org]
  );
  const colsALL = useMemo(
    () => visibleProductsForAll(peopleAll, productConfigs, allowed),
    [peopleAll, productConfigs, allowed]
  );

  const minW = { minWidth: 360 + colsALL.length * 160 };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat icon={<Users size={18} />} label="Total Anggota" value={org.length - 1} />
        <Stat icon={<ClipboardList size={18} />} label="Input (bulan ini)"
          value={ach.filter(a => a.date.slice(0, 7) === today().slice(0, 7)).length} />
        <Stat icon={<TargetIcon size={18} />} label="Micro (KUR+KUM/MBM)" value={nfmt(microKURKUM)} />
      </div>

      <Section title="Overview Semua Pegawai">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm" style={minW}>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-2 min-w-[220px] sticky left-0 bg-slate-50 z-10">Nama</th>
                <th className="p-2 min-w-[140px] sticky left-[220px] bg-slate-50 z-10">Role</th>
                {colsALL.map(cfg => (
                  <th key={cfg.name} className="p-2 w-[160px] text-right">{cfg.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {peopleAll.map(p => (
                <PersonRow
                  key={p.id}
                  p={p}
                  ppIdx={ppIdx}
                  targets={targets}
                  productConfigs={colsALL}
                  allowed={allowed}
                />
              ))}
            </tbody>
          </table>
        </div>
        {colsALL.length === 0 && (
          <div className="text-xs text-slate-500 mt-2">Belum ada produk yang diizinkan untuk siapapun.</div>
        )}
      </Section>
    </div>
  );
}

/* =========================================================
   UNIT BOARD (tetap ada bila kamu butuh per unit)
========================================================= */
function UnitBoard({
  unit, title, ach, unitTotal, targets, productConfigs, allowed, org
}: {
  unit: Person["unit"];
  title: string;
  ach: Achievement[];
  unitTotal: (u: Person["unit"]) => number;
  targets: TargetsPP;
  productConfigs: ProductConfig[];
  allowed: AllowedMap;
  org: Person[];
}) {
  const ppIdx = useMemo(() => buildPersonProductIndex(ach), [ach]);

  const people = org.filter(byUnit(unit));
  const cols = visibleProductsForUnit(people, productConfigs, allowed);
  const minW = { minWidth: 360 + cols.length * 160 };

  return (
    <div className="space-y-4">
      <Section title={title} extra={<div className="text-sm text-slate-500">Total unit: {nfmt(unitTotal(unit))}</div>}>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm" style={minW}>
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-2 min-w-[220px] sticky left-0 bg-slate-50 z-10">Nama</th>
                <th className="p-2 min-w-[140px] sticky left-[220px] bg-slate-50 z-10">Role</th>
                {cols.map(cfg => (
                  <th key={cfg.name} className="p-2 w-[160px] text-right">{cfg.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map(p => (
                <PersonRow key={p.id} p={p} ppIdx={ppIdx} targets={targets} productConfigs={cols} allowed={allowed} />
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Detail Input Terakhir">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm min-w-[800px]">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-2 w-[180px]">Tanggal</th>
                <th className="p-2 w-[240px]">Nama</th>
                <th className="p-2 w-[320px]">Produk</th>
                <th className="p-2 w-[140px] text-right">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {ach
                .filter(a => org.find(p => p.id === a.personId)?.unit === unit)
                .slice(-25).reverse().map(a => (
                  <tr key={a.id} className="border-t align-top">
                    <td className="p-2 whitespace-nowrap">{a.date}</td>
                    <td className="p-2 min-w-0 truncate">{org.find(p => p.id === a.personId)?.name}</td>
                    <td className="p-2 min-w-0 break-words">{a.product}</td>
                    <td className="p-2 text-right whitespace-nowrap">{nfmt(a.amount)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

/* =========================================================
   INDIVIDUALS
========================================================= */
function Individuals({
  ach, productConfigs, targets, allowed, org
}: {
  ach: Achievement[];
  productConfigs: ProductConfig[];
  targets: TargetsPP;
  allowed: AllowedMap;
  org: Person[];
}) {
  const ppIdx = useMemo(() => buildPersonProductIndex(ach), [ach]);
  return (
    <div className="space-y-4">
      {org.filter(p => p.unit !== "LEAD" && !["MBM", "BOS"].includes(p.role)).map(p => (
        <Section key={p.id} title={`${p.name} — ${p.role}`}>
          <div className="grid md:grid-cols-3 gap-3">
            {productConfigs.filter(cfg => !!allowed?.[p.id]?.[cfg.name]).map(cfg => {
              const val = getPP(ppIdx, p.id, cfg.name);
              const tgt = getTarget(targets, p.id, cfg.name);
              return (
                <div key={cfg.name} className="p-3 rounded-xl border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-slate-600">{cfg.name}</div>
                    <div className="text-sm font-medium">{cfg.type === "money" ? nfmt(val) : val}</div>
                  </div>
                  <PBar value={val} target={tgt} />
                </div>
              );
            })}
            <div className="text-xs text-slate-500 md:col-span-3">
              * Money ditampilkan sebagai rupiah; Unit sebagai jumlah.
            </div>
          </div>
        </Section>
      ))}
    </div>
  );
}

/* =========================================================
   INPUT PANEL (BM)
========================================================= */
function InputPanel({
  pinOk, setPinOk, form, setForm, addAchievement, ach, removeAchievement,
  targets, setTargets, productConfigs, setProductConfigs, allowed, setAllowed,
  org, setOrg, setAch, importLegacyOnce
}: {
  pinOk: boolean;
  setPinOk: Dispatch<SetStateAction<boolean>>;
  form: { personId: string; product: string; amount: string; date: string };
  setForm: Dispatch<SetStateAction<{ personId: string; product: string; amount: string; date: string }>>;
  addAchievement: () => void;
  ach: Achievement[];
  removeAchievement: (id: string) => void;
  targets: TargetsPP;
  setTargets: Dispatch<SetStateAction<TargetsPP>>;
  productConfigs: ProductConfig[];
  setProductConfigs: Dispatch<SetStateAction<ProductConfig[]>>;
  allowed: AllowedMap;
  setAllowed: Dispatch<SetStateAction<AllowedMap>>;
  org: Person[];
  setOrg: Dispatch<SetStateAction<Person[]>>;
  setAch: Dispatch<SetStateAction<Achievement[]>>;
  importLegacyOnce: () => void;
}) {
  const [newProd, setNewProd] = useState("");
  const [newType, setNewType] = useState<ProductType>("money");

  const [newEmp, setNewEmp] = useState<{ name: string; role: string; unit: Person["unit"] }>({
    name: "", role: "SGP", unit: "MBM"
  });

  const ensureTargetsForProducts = (names: string[], people: Person[]) => {
    setTargets(prev => {
      const next = { ...(prev || {}) };
      people.forEach(p => {
        if (p.unit === "LEAD") return;
        next[p.id] = next[p.id] || {};
        names.forEach(n => { if (next[p.id][n] === undefined) next[p.id][n] = 0; });
      });
      save(K_TGT_PP, next);
      return next;
    });
  };
  const ensureAllowedForProducts = (names: string[], people: Person[], defaultAllowed = true) => {
    setAllowed(prev => {
      const next = { ...(prev || {}) };
      people.forEach(p => {
        if (p.unit === "LEAD") return;
        next[p.id] = next[p.id] || {};
        names.forEach(n => { if (next[p.id][n] === undefined) next[p.id][n] = defaultAllowed; });
      });
      save(K_ALLOWED, next);
      return next;
    });
  };

  const addProduct = () => {
    const name = newProd.trim();
    if (!name) return;
    if (productConfigs.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      alert("Produk sudah ada."); return;
    }
    const cfg = { name, type: newType } as ProductConfig;
    const next = [...productConfigs, cfg];
    setProductConfigs(next);
    save(K_FP, next);
    ensureTargetsForProducts([name], org);
    ensureAllowedForProducts([name], org, true);
    setNewProd("");
  };

  const removeProduct = (name: string) => {
    if (!confirm(`Hapus kolom produk "${name}"? Data target & izin lama tetap tersimpan.`)) return;
    const next = productConfigs.filter(c => c.name !== name);
    setProductConfigs(next);
    save(K_FP, next);
  };

  const productNames = productConfigs.map(c => c.name);
  const allowedListForSelected = form.personId
    ? productConfigs.filter(cfg => !!allowed?.[form.personId]?.[cfg.name]).map(c => c.name)
    : [];
  const canAdd = !!form.personId && !!form.product && !!form.amount &&
    (!!allowed?.[form.personId]?.[form.product]);

  const addEmployee = () => {
    const name = newEmp.name.trim();
    if (!name) return alert("Nama wajib diisi.");
    const id = `emp-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${uid()}`;
    const person: Person = { id, name, role: newEmp.role.trim() || "Staff", unit: newEmp.unit };
    const next = [...org, person];
    setOrg(next); save(K_ORG, next);
    ensureTargetsForProducts(productNames, [person]);
    ensureAllowedForProducts(productNames, [person], true);
    setNewEmp({ name: "", role: "SGP", unit: "MBM" });
  };
  const deleteEmployee = (id: string) => {
    const emp = org.find(o => o.id === id);
    if (!emp) return;
    if (emp.unit === "LEAD") return alert("Pegawai LEAD tidak bisa dihapus.");
    if (!confirm(`Hapus pegawai "${emp.name}"? Semua perolehan terkait juga akan dihapus.`)) return;
    const nextOrg = org.filter(o => o.id !== id);
    setOrg(nextOrg); save(K_ORG, nextOrg);
    setTargets(prev => { const cur = { ...(prev || {}) }; delete cur[id]; save(K_TGT_PP, cur); return cur; });
    setAllowed(prev => { const cur = { ...(prev || {}) }; delete cur[id]; save(K_ALLOWED, cur); return cur; });
    setAch((s: Achievement[]) => s.filter((a: Achievement) => a.personId !== id));
    setForm(f => (f.personId === id ? { ...f, personId: "", product: "" } : f));
  };

  // --- UI
  return (
    <div className="space-y-4">
      {!pinOk ? (
        <Section title="Masuk sebagai Branch Manager">
          <div className="flex items-center gap-2">
            <input id="pin" className="px-3 py-2 rounded-xl border w-64" placeholder="Masukkan PIN" type="password" />
            <Btn onClick={() => {
              const v = (document.getElementById("pin") as HTMLInputElement).value;
              if (v === "MANDIRI123") setPinOk(true); else alert("PIN salah");
            }}><Unlock size={16} /> Masuk</Btn>
          </div>
          <div className="text-xs text-slate-500 mt-2">* Sementara pakai PIN lokal. Bisa dipindah ke backend nanti.</div>
        </Section>
      ) : (
        <>
          <Section
            title="Input Perolehan (BM Only)"
            extra={<Btn className="!bg-slate-700" onClick={() => setPinOk(false)}><Lock size={14} /> Kunci</Btn>}
          >
            <div className="grid md:grid-cols-4 gap-3 items-end">
              <div>
                <div className="text-sm mb-1">Nama</div>
                <select className="px-3 py-2 rounded-xl border w-full"
                  value={form.personId}
                  onChange={e => setForm({ ...form, personId: e.target.value })}
                >
                  <option value="">— Pilih —</option>
                  {org.filter(p => p.unit !== "LEAD").map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-sm mb-1">Produk</div>
                <select className="px-3 py-2 rounded-xl border w-full"
                  value={form.product}
                  onChange={e => setForm({ ...form, product: e.target.value })}
                  disabled={!form.personId || productConfigs.length === 0 || allowedListForSelected.length === 0}
                >
                  <option value="">
                    {!form.personId ? "Pilih nama dulu"
                      : allowedListForSelected.length ? "— Pilih Produk —"
                      : "Pegawai ini belum diizinkan produk apapun"}
                  </option>
                  {productConfigs
                    .filter(cfg => !!allowed?.[form.personId]?.[cfg.name])
                    .map(cfg => (<option key={cfg.name} value={cfg.name}>{cfg.name}</option>))}
                </select>
                <div className="text-xs text-slate-500 mt-1">Sumber: Kelola Kolom Produk + Izin Pegawai</div>
              </div>

              <div>
                <div className="text-sm mb-1">Nilai</div>
                <input className="px-3 py-2 rounded-xl border w-full"
                  type="number" inputMode="numeric" placeholder="contoh: 5000000 / 1"
                  value={form.amount}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const sanitized = raw.replace(/[^\d]/g, "");
                    setForm({ ...form, amount: sanitized });
                  }} />
              </div>

              <div>
                <div className="text-sm mb-1">Tanggal</div>
                <input className="px-3 py-2 rounded-xl border w-full" type="date"
                  value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>

              <div className="md:col-span-4">
                <Btn
                  className={`${canAdd ? "!bg-indigo-600" : "!bg-slate-400"} !text-white flex items-center gap-2`}
                  onClick={() => { if (canAdd) addAchievement(); }}
                  disabled={!canAdd}
                >
                  <Plus size={16} /> Tambah
                </Btn>
              </div>
            </div>
          </Section>

          {/* Kelola kolom produk */}
          <Section title="Kelola Kolom Produk (Target & Progress)">
            <div className="grid md:grid-cols-4 gap-3 items-end">
              <div className="md:col-span-2">
                <div className="text-sm mb-1">Nama Produk</div>
                <input className="px-3 py-2 rounded-xl border w-full" placeholder='mis: "KUM"'
                  value={newProd} onChange={e => setNewProd(e.target.value)} />
              </div>
              <div>
                <div className="text-sm mb-1">Tipe</div>
                <select className="px-3 py-2 rounded-xl border w-full"
                  value={newType} onChange={e => setNewType(e.target.value as ProductType)}>
                  <option value="money">Money (Rp)</option>
                  <option value="unit">Unit (pcs)</option>
                </select>
              </div>
              <div>
                <Btn className="!bg-indigo-600" onClick={addProduct}>Tambah Kolom</Btn>
              </div>
            </div>

            {productConfigs.length > 0 && (
              <div className="mt-3 grid md:grid-cols-3 gap-2">
                {productConfigs.map(cfg => (
                  <div key={cfg.name} className="px-3 py-2 rounded-xl border flex items-center justify-between">
                    <div>
                      <div className="font-medium">{cfg.name}</div>
                      <div className="text-xs text-slate-500">{cfg.type === "money" ? "Money (Rp)" : "Unit"}</div>
                    </div>
                    <Btn className="!bg-red-600" onClick={() => removeProduct(cfg.name)} title="Hapus kolom">
                      <X size={14} /> Hapus
                    </Btn>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Izin per orang per produk */}
          <Section title="Izin Produk per Pegawai">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm" style={{ minWidth: 360 + productConfigs.length * 120 }}>
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="p-2 min-w-[260px] sticky left-0 bg-slate-50 z-10">Nama</th>
                    <th className="p-2 min-w-[160px] sticky left-[260px] bg-slate-50 z-10">Role</th>
                    {productConfigs.map(cfg => (<th key={cfg.name} className="p-2 text-center min-w-[120px]">{cfg.name}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {org.filter(p => p.unit !== "LEAD").map(p => (
                    <tr key={p.id} className="border-t align-top">
                      <td className="p-2 min-w-[260px] sticky left-0 bg-white z-10">{p.name}</td>
                      <td className="p-2 min-w-[160px] sticky left-[260px] bg-white z-10 text-slate-600">{p.role}</td>
                      {productConfigs.map(cfg => (
                        <td key={cfg.name} className="p-2 text-center min-w-[120px]">
                          <input type="checkbox"
                            checked={!!allowed?.[p.id]?.[cfg.name]}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setAllowed(prev => {
                                const cur = { ...(prev || {}) };
                                cur[p.id] = cur[p.id] || {};
                                cur[p.id][cfg.name] = checked;
                                save(K_ALLOWED, cur);
                                return { ...cur };
                              });
                            }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Target per orang per produk — FIX anti menumpuk */}
          <Section title="Target per Orang • per Produk">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm" style={{ minWidth: 420 + productConfigs.length * 160 }}>
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="p-2 min-w-[260px] sticky left-0 bg-slate-50 z-10">Nama</th>
                    <th className="p-2 min-w-[160px] sticky left-[260px] bg-slate-50 z-10">Role</th>
                    {productConfigs.map(cfg => (<th key={cfg.name} className="p-2 text-right min-w-[160px]">{cfg.name}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {org.filter(p => p.unit !== "LEAD").map(p => (
                    <tr key={p.id} className="border-t align-top">
                      <td className="p-2 min-w-[260px] sticky left-0 bg-white z-10">{p.name}</td>
                      <td className="p-2 min-w-[160px] sticky left-[260px] bg-white z-10 text-slate-600">{p.role}</td>
                      {productConfigs.map(cfg => {
                        const enabled = !!allowed?.[p.id]?.[cfg.name];
                        return (
                          <td key={cfg.name} className="p-2 text-right min-w-[160px]">
                            <input
                              className={`px-2 py-1 rounded-lg border w-full text-right ${enabled ? "" : "bg-slate-100 text-slate-400"}`}
                              type="number" inputMode="numeric"
                              value={String(targets?.[p.id]?.[cfg.name] ?? "")}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^\d]/g, "");
                                setTargets(prev => {
                                  const cur = { ...(prev || {}) };
                                  if (!cur[p.id]) cur[p.id] = {};
                                  cur[p.id][cfg.name] = v ? Number(v) : 0;
                                  save(K_TGT_PP, cur);
                                  return { ...cur };
                                });
                              }}
                              placeholder="0"
                              title={cfg.type === "money" ? "Rupiah" : "Unit"}
                              disabled={!enabled}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Kelola Pegawai */}
          <Section title="Kelola Pegawai">
            <div className="grid md:grid-cols-5 gap-3 items-end">
              <div className="md:col-span-2">
                <div className="text-sm mb-1">Nama</div>
                <input className="px-3 py-2 rounded-xl border w-full"
                  value={newEmp.name} onChange={e => setNewEmp(v => ({ ...v, name: e.target.value }))} />
              </div>
              <div>
                <div className="text-sm mb-1">Role</div>
                <input className="px-3 py-2 rounded-xl border w-full"
                  placeholder="mis: SGP / Teller / CS"
                  value={newEmp.role} onChange={e => setNewEmp(v => ({ ...v, role: e.target.value }))} />
              </div>
              <div>
                <div className="text-sm mb-1">Unit</div>
                <select className="px-3 py-2 rounded-xl border w-full"
                  value={newEmp.unit} onChange={e => setNewEmp(v => ({ ...v, unit: e.target.value as Person['unit'] }))}>
                  <option value="MBM">MBM</option>
                  <option value="BOS">BOS</option>
                  <option value="SOCIAL">SOCIAL</option>
                  <option value="SGK">SGK</option>
                </select>
              </div>
              <div>
                <Btn className="!bg-indigo-600" onClick={addEmployee}>Tambah Pegawai</Btn>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full table-fixed text-sm min-w-[720px]">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="p-2 w-[36%]">Nama</th>
                    <th className="p-2 w-[20%]">Role</th>
                    <th className="p-2 w-[16%]">Unit</th>
                    <th className="p-2 w-[12%] text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {org.map(p => (
                    <tr key={p.id} className="border-t">
                      <td className="p-2 min-w-0 truncate">{p.name}</td>
                      <td className="p-2 min-w-0 truncate text-slate-600">{p.role}</td>
                      <td className="p-2">{p.unit}</td>
                      <td className="p-2 text-right">
                        <Btn className={`!bg-red-600 ${p.unit === "LEAD" ? "!bg-slate-300" : ""}`}
                          onClick={() => deleteEmployee(p.id)} title="Hapus pegawai" >
                          Hapus
                        </Btn>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-xs text-slate-500 mt-2">
                * Menghapus pegawai akan menghapus perolehan, target, dan izin terkait.
              </div>
            </div>
          </Section>

          {/* Log Input Terbaru + tombol impor local legacy */}
          <Section title="Log Input Terbaru" extra={
            <div className="flex gap-2">
              <Btn className="!bg-emerald-600" onClick={importLegacyOnce}><Download size={16}/> Impor Ach Lama ke DB (sekali)</Btn>
            </div>
          }>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm min-w-[900px]">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="p-2 w-[180px]">Tanggal</th>
                    <th className="p-2 w-[240px]">Nama</th>
                    <th className="p-2 w-[320px]">Produk</th>
                    <th className="p-2 w-[140px] text-right">Nilai</th>
                    <th className="p-2 w-[140px]">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {ach.slice(-50).reverse().map(a => {
                    const p = org.find(x => x.id === a.personId)!;
                    return (
                      <tr key={a.id} className="border-t align-top">
                        <td className="p-2 whitespace-nowrap">{a.date}</td>
                        <td className="p-2 min-w-0 truncate">{p?.name}</td>
                        <td className="p-2 min-w-0 break-words">{a.product}</td>
                        <td className="p-2 text-right whitespace-nowrap">{nfmt(a.amount)}</td>
                        <td className="p-2">
                          <Btn className="!bg-red-600" onClick={() => removeAchievement(a.id)}>Hapus</Btn>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

/* =========================================================
   MAIN APP
========================================================= */
export default function App() {
  const DEFAULT_PRODUCT_CONFIG: ProductConfig[] = [
    { name: "KUR", type: "money" },
    { name: "LIVIN", type: "unit" },
    { name: "AXA", type: "unit" },
  ];

  const [org, setOrg] = useState<Person>(() => null as any) as any; // to satisfy TS initial
  const orgRef = useRef<Person[]>(load<Person[]>(K_ORG, DEFAULT_ORG));
  const [orgState, setOrgState] = useState<Person[]>(orgRef.current);
  useEffect(() => { setOrg(orgState as any); }, [orgState]); // compatibility alias
  useEffect(() => save(K_ORG, orgState), [orgState]);

  // ACHIEVEMENTS — sumber kebenaran: DB (Neon)
  const [ach, setAch] = useState<Achievement[]>([]);
  const [pinOk, setPinOk] = useState<boolean>(load<boolean>(K_PINOK, false));
  const [tab, setTab] = useState<"Overview" | "MBM" | "BOS" | "SOCIAL" | "SGK" | "Individuals" | "Input">("Overview");

  const [productConfigs, setProductConfigs] = useState<ProductConfig[]>(
    () => load<ProductConfig[]>(K_FP, DEFAULT_PRODUCT_CONFIG)
  );
  useEffect(() => save(K_FP, productConfigs), [productConfigs]);

  const [targets, setTargets] = useState<TargetsPP>(() => load<TargetsPP>(K_TGT_PP, {}));
  useEffect(() => save(K_TGT_PP, targets), [targets]);

  const [allowed, setAllowed] = useState<AllowedMap>(() => load<AllowedMap>(K_ALLOWED, {}));
  useEffect(() => save(K_ALLOWED, allowed), [allowed]);

  // Sinkronisasi target/izin saat daftar produk berubah
  useEffect(() => {
    const names = productConfigs.map(c => c.name);
    setTargets(prev => {
      const next = { ...(prev || {}) };
      orgRef.current.forEach(p => {
        if (p.unit === "LEAD") return;
        next[p.id] = next[p.id] || {};
        names.forEach(n => { if (next[p.id][n] === undefined) next[p.id][n] = 0; });
      });
      save(K_TGT_PP, next);
      return next;
    });
    setAllowed(prev => {
      const next = { ...(prev || {}) };
      orgRef.current.forEach(p => {
        if (p.unit === "LEAD") return;
        next[p.id] = next[p.id] || {};
        names.forEach(n => { if (next[p.id][n] === undefined) next[p.id][n] = true; });
      });
      save(K_ALLOWED, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productConfigs.map(c => c.name).join("|"), orgState.map(o => o.id).join("|")]);

  useEffect(() => save(K_PINOK, pinOk), [pinOk]);

  // FETCH DB on mount (current month by default)
  const [month, setMonth] = useState(() => {
    const d = new Date(); d.setDate(1);
    return ymd(d).slice(0, 7); // YYYY-MM
  });
  const refreshFromDB = async () => {
    const [y, m] = month.split("-");
    const from = `${y}-${m}-01`;
    const to = ymd(new Date(Number(y), Number(m), 1)); // first day next month
    const rows = await apiGetAchievements(from, to);
    setAch(rows);
  };
  useEffect(() => { refreshFromDB(); }, [month]);

  // SYNC persons to DB everytime orgState changes (debounced)
  useEffect(() => {
    orgRef.current = orgState;
    const t = setTimeout(() => { apiSyncPersons(orgState).catch(() => {}); }, 300);
    return () => clearTimeout(t);
  }, [orgState]);

  // Statistik unit
  const totalsByPerson = useMemo(() => sumByPerson(ach), [ach]);
  const unitTotal = (unit: Person["unit"]) =>
    orgState.filter(p => p.unit === unit && !["MBM", "BOS", "BM"].includes(p.role))
      .reduce((s, p) => s + (totalsByPerson.get(p.id) || 0), 0);

  // Input form
  const [form, setForm] = useState<{ personId: string; product: string; amount: string; date: string }>(
    () => ({ personId: "", product: productConfigs[0]?.name ?? "", amount: "", date: today() })
  );

  const addAchievement = async () => {
    if (!form.personId || !form.product || !form.amount) return alert("Lengkapi data.");
    if (!allowed?.[form.personId]?.[form.product]) return alert("Produk tidak diizinkan untuk pegawai ini.");
    const amount = Number(form.amount);
    if (Number.isNaN(amount) || amount < 0) return alert("Amount tidak valid.");
    const payload = { personId: form.personId, product: form.product, amount, date: form.date };
    const row = await apiPostAchievement(payload);
    setAch(s => [{ id: row.id, personId: row.person_id, product: row.product, amount: Number(row.amount), date: row.date.slice(0, 10) }, ...s]);
    setForm(f => ({ ...f, amount: "" }));
  };

  const removeAchievement = async (id: string) => {
    await apiDeleteAchievement(id);
    setAch(s => s.filter(x => x.id !== id));
  };

  // Menjaga pilihan produk tetap valid saat person berubah
  useEffect(() => {
    setForm(f => {
      if (!f.personId) return f;
      const names = productConfigs.filter(cfg => !!allowed?.[f.personId]?.[cfg.name]).map(c => c.name);
      if (names.length === 0) return { ...f, product: "" };
      if (!names.includes(f.product)) return { ...f, product: names[0] };
      return f;
    });
  }, [form.personId, productConfigs, allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Legacy importer — migrasikan K_ACH lama (localStorage) ke DB (sekali tekan)
  const importLegacyOnce = async () => {
    const legacy = load<Achievement[]>(K_ACH, []);
    if (!legacy.length) { alert("Tidak ada data legacy di localStorage."); return; }
    if (!confirm(`Impor ${legacy.length} achievement lama ke database?`)) return;
    for (const a of legacy) {
      try {
        await apiPostAchievement({ personId: a.personId, product: a.product, amount: a.amount, date: a.date });
      } catch { /* ignore duplicates */ }
    }
    localStorage.removeItem(K_ACH);
    await refreshFromDB();
    alert("Selesai diimpor ke DB.");
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      {/* HEADER */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="w-full px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-600" />
            <div>
              <div className="font-semibold">Sukamara Team Portal</div>
              <div className="text-xs text-slate-500">BM input + DB (Neon)</div>
            </div>
          </div>

          <div className="flex-1" />

          {/* NAV — teks putih */}
          <nav className="flex gap-2 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(["Overview","MBM","BOS","SOCIAL","SGK","Individuals","Input"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-xl border transition-colors bg-slate-900 text-white
                  ${tab === t ? "border-indigo-600" : "border-slate-800 hover:bg-slate-800"}`}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* MAIN */}
      <main className="w-full px-6 py-4 space-y-4">
        {/* Bar rekap + export CSV bulan ini */}
        <Section
          title="Rekap Bulanan & Leaderboard (Fair Ranking)"
          extra={<div className="text-sm text-slate-500">CSV bisa dibuka di Excel</div>}
        >
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="px-3 py-2 rounded-xl border"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <Btn className="!bg-indigo-600" onClick={async () => {
              // export CSV untuk bulan yang sedang dipilih
              const [y, m] = month.split("-");
              const from = `${y}-${m}-01`;
              const to = ymd(new Date(Number(y), Number(m), 1));
              const rows = await apiGetAchievements(from, to);
              const csv = makeCSV(rows.map(r => ({
                date: r.date, personId: r.personId, product: r.product, amount: r.amount
              })), ["date","personId","product","amount"]);
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `rekap_${month}.csv`; a.click();
              URL.revokeObjectURL(url);
            }}><Download size={16}/> Download Rekap (CSV)</Btn>
            <Btn className="!bg-slate-700" onClick={refreshFromDB}><RefreshCcw size={16}/> Refresh</Btn>
          </div>
        </Section>

        {tab === "Overview" && (
          <Overview
            ach={ach}
            unitTotal={unitTotal}
            targets={targets}
            productConfigs={productConfigs}
            allowed={allowed}
            org={orgRef.current}
          />
        )}
        {tab === "MBM" && (
          <UnitBoard
            unit="MBM"
            title="Dashboard MBM (SGP)"
            ach={ach}
            unitTotal={unitTotal}
            targets={targets}
            productConfigs={productConfigs}
            allowed={allowed}
            org={orgRef.current}
          />
        )}
        {tab === "BOS" && (
          <UnitBoard
            unit="BOS"
            title="Dashboard BOS (Teller/CS/Security)"
            ach={ach}
            unitTotal={unitTotal}
            targets={targets}
            productConfigs={productConfigs}
            allowed={allowed}
            org={orgRef.current}
          />
        )}
        {tab === "SOCIAL" && (
          <UnitBoard
            unit="SOCIAL"
            title="Dashboard Bantuan Sosial"
            ach={ach}
            unitTotal={unitTotal}
            targets={targets}
            productConfigs={productConfigs}
            allowed={allowed}
            org={orgRef.current}
          />
        )}
        {tab === "SGK" && (
          <UnitBoard
            unit="SGK"
            title="Dashboard SGK (Galih Putra)"
            ach={ach}
            unitTotal={unitTotal}
            targets={targets}
            productConfigs={productConfigs}
            allowed={allowed}
            org={orgRef.current}
          />
        )}
        {tab === "Individuals" && (
          <Individuals
            ach={ach}
            targets={targets}
            productConfigs={productConfigs}
            allowed={allowed}
            org={orgRef.current}
          />
        )}
        {tab === "Input" && (
          <InputPanel
            pinOk={pinOk}
            setPinOk={setPinOk}
            form={form}
            setForm={setForm}
            addAchievement={addAchievement}
            ach={ach}
            removeAchievement={removeAchievement}
            targets={targets}
            setTargets={setTargets}
            productConfigs={productConfigs}
            setProductConfigs={setProductConfigs}
            allowed={allowed}
            setAllowed={setAllowed}
            org={orgRef.current}
            setOrg={setOrgState}
            setAch={setAch}
            importLegacyOnce={importLegacyOnce}
          />
        )}

        <footer className="pt-6 text-sm text-slate-500 flex items-center gap-2">
          <CheckCircle2 size={16} /> Progress/konfigurasi target & izin tersimpan lokal; perolehan tersimpan di DB (Neon).
        </footer>
      </main>
    </div>
  );
}
