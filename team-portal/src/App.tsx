import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Users,
  ClipboardList,
  Target as TargetIcon,
  Lock,
  Unlock,
  Plus,
  Shield,
  CheckCircle2,
  X,
} from "lucide-react";
import { Link, Routes, Route, useNavigate } from "react-router-dom";

/* ==============================================
   Team Management — Dynamic products + per-person permissions
   ============================================== */

// -------- Types --------
export type Person = {
  id: string;
  name: string;
  role: string; // e.g., "SGP", "Teller", dll.
  unit: "MBM" | "BOS" | "SOCIAL" | "SGK" | "LEAD";
};

export type Achievement = {
  id: string;
  personId: string;
  product: string; // e.g., "KUR", "LIVIN", "AXA", "KUM"
  amount: number; // Money-type = rupiah; Unit-type = pcs
  date: string; // YYYY-MM-DD
};

type ProductType = "money" | "unit";
type ProductConfig = { name: string; type: ProductType };

// izin produk per pegawai
type AllowedMap = Record<string, Record<string, boolean>>;

// Pengelompokan PIC
type PersonCategory = "MIKRO" | "OPERASIONAL";
type PersonCategoryMap = Record<string, PersonCategory>;

// -------- Storage Keys --------
const K_ORG = "tm_org_v1";
const K_ACH = "tm_achievements";
const K_PINOK = "tm_pin_ok";
const K_TGT_PP = "tm_targets_pp"; // Record<personId, Record<product, number>>
const K_FP = "tm_featured_products_v2"; // ProductConfig[]
const K_ALLOWED = "tm_allowed_products_v1"; // AllowedMap
const K_PIC_CAT = "tm_pic_category_v1"; // PersonCategoryMap

// -------- Helpers --------
const uid = () => Math.random().toString(36).slice(2, 9);
const today = () => new Date().toISOString().slice(0, 10);
const nfmt = (n: number) => n.toLocaleString();

const load = <T,>(k: string, def: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : def;
  } catch {
    return def;
  }
};
const save = (k: string, v: any) => localStorage.setItem(k, JSON.stringify(v));

const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  return r.json();
};

// Default org (fallback jika API belum ada)
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

// Default produk
const DEFAULT_PRODUCT_CONFIG: ProductConfig[] = [
  { name: "KUR", type: "money" },
  { name: "LIVIN", type: "unit" },
  { name: "AXA", type: "unit" },
];

// --- kategori default utk pegawai
const defaultCategoryForPerson = (p: Person): PersonCategory => {
  const r = p.role.toLowerCase();
  if (r.includes("security") || p.unit === "SGK" || p.unit === "SOCIAL") {
    return "OPERASIONAL";
  }
  return "MIKRO";
};

function sumByPerson(achs: Achievement[]) {
  const map = new Map<string, number>();
  for (const a of achs)
    map.set(a.personId, (map.get(a.personId) || 0) + (Number(a.amount) || 0));
  return map;
}
const byUnit =
  (unit: Person["unit"]) => (p: Person) =>
    p.unit === unit && !p.role.match(/MBM|BOS|BM/);

// index per orang-per produk
function buildPersonProductIndex(achs: Achievement[]) {
  const idx = new Map<string, Map<string, number>>(); // personId -> (product -> total)
  for (const a of achs) {
    if (!idx.has(a.personId)) idx.set(a.personId, new Map());
    const m = idx.get(a.personId)!;
    m.set(a.product, (m.get(a.product) || 0) + (Number(a.amount) || 0));
  }
  return idx;
}
const getPP = (
  ppIdx: Map<string, Map<string, number>>,
  personId: string,
  product: string,
) => Number(ppIdx.get(personId)?.get(product) || 0);

// Target helpers (per orang per produk)
type TargetsPP = Record<string, Record<string, number>>;
const getTarget = (targets: TargetsPP, personId: string, product: string) =>
  Number(targets?.[personId]?.[product] || 0);

// ====== Micro only: KUR + KUM ======
const MICRO_INCLUDED_PRODUCTS = ["KUR", "KUM"];
function unitTotalForProducts(
  ach: Achievement[],
  unit: Person["unit"],
  products: string[],
  org: Person[],
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

// Progress bar kecil per-produk
function PBar({ value, target }: { value: number; target: number }) {
  if (!target || target <= 0)
    return <div className="text-[11px] text-slate-400">—</div>;
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

// ---------- UI atoms ----------
const Stat = ({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) => (
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

const Section = ({
  title,
  children,
  extra,
}: {
  title: string;
  children: ReactNode;
  extra?: ReactNode;
}) => (
  <div className="p-4 rounded-2xl bg-white border overflow-hidden">
    <div className="flex items-center justify-between mb-3">
      <div className="font-semibold">{title}</div>
      {extra}
    </div>
    {children}
  </div>
);

// ====== Cell per-produk: nilai + bar ======
function ProductCell({
  value,
  target,
  isMoney,
}: {
  value: number;
  target: number;
  isMoney: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-right text-sm">{isMoney ? nfmt(value) : value}</div>
      <PBar value={value} target={target} />
    </div>
  );
}

// ===== util: pilih kolom yang perlu ditampilkan untuk suatu unit =====
function visibleProductsForUnit(
  people: Person[],
  productConfigs: ProductConfig[],
  allowed: AllowedMap,
): ProductConfig[] {
  return productConfigs.filter((cfg) =>
    people.some((p) => !!allowed?.[p.id]?.[cfg.name]),
  );
}

/* ===================================================
   DASHBOARD (BM)
   =================================================== */

function Overview({
  ach,
  unitTotal,
  targets,
  productConfigs,
  allowed,
  org,
}: {
  ach: Achievement[];
  unitTotal: (u: Person["unit"]) => number;
  targets: TargetsPP;
  productConfigs: ProductConfig[];
  allowed: AllowedMap;
  org: Person[];
}) {
  const ppIdx = useMemo(() => buildPersonProductIndex(ach), [ach]);

  // HANYA KUR + KUM untuk kartu "Micro" (unit MBM/SGP)
  const microKURKUM = useMemo(
    () => unitTotalForProducts(ach, "MBM", MICRO_INCLUDED_PRODUCTS, org),
    [ach, org],
  );

  const ProductHeads = ({ list }: { list: ProductConfig[] }) => (
    <>
      {list.map((cfg) => (
        <th key={cfg.name} className="p-2 w-[22%] text-right">
          {cfg.name}
        </th>
      ))}
    </>
  );

  // orang per unit
  const peopleMBM = org.filter(byUnit("MBM"));
  const peopleBOS = org.filter(byUnit("BOS"));
  const peopleSOC = org.filter(byUnit("SOCIAL"));
  const peopleSGK = org.filter(byUnit("SGK"));

  // kolom yang benar-benar dipakai per unit (hanya kalau ada yg allowed)
  const colsMBM = visibleProductsForUnit(peopleMBM, productConfigs, allowed);
  const colsBOS = visibleProductsForUnit(peopleBOS, productConfigs, allowed);
  const colsSOC = visibleProductsForUnit(peopleSOC, productConfigs, allowed);
  const colsSGK = visibleProductsForUnit(peopleSGK, productConfigs, allowed);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Stat icon={<Users size={18} />} label="Total Anggota" value={org.length - 1} />
      <Stat
        icon={<ClipboardList size={18} />}
        label="Input (bulan ini)"
        value={
          ach.filter((a) => a.date.slice(0, 7) === today().slice(0, 7)).length
        }
      />
      <Stat icon={<TargetIcon size={18} />} label="Micro" value={nfmt(microKURKUM)} />
      <Stat icon={<Shield size={18} />} label="Operasional" value={nfmt(unitTotal("BOS"))} />

      {/* MBM */}
      <Section title="Ringkasan MBM (SGP)">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-2 w-[18%]">Nama</th>
              <th className="p-2 w-[12%]">Role</th>
              <ProductHeads list={colsMBM} />
            </tr>
          </thead>
          <tbody>
            {peopleMBM.map((p) => (
              <PersonRow
                key={p.id}
                p={p}
                ppIdx={ppIdx}
                targets={targets}
                productConfigs={colsMBM}
                allowed={allowed}
              />
            ))}
          </tbody>
        </table>
        {colsMBM.length === 0 && (
          <div className="text-xs text-slate-500 mt-2">
            Tidak ada produk yang diizinkan di unit ini.
          </div>
        )}
      </Section>

      {/* BOS */}
      <Section title="Ringkasan BOS (Teller/CS/Security)">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-2 w-[18%]">Nama</th>
              <th className="p-2 w-[12%]">Role</th>
              <ProductHeads list={colsBOS} />
            </tr>
          </thead>
          <tbody>
            {peopleBOS.map((p) => (
              <PersonRow
                key={p.id}
                p={p}
                ppIdx={ppIdx}
                targets={targets}
                productConfigs={colsBOS}
                allowed={allowed}
              />
            ))}
          </tbody>
        </table>
        {colsBOS.length === 0 && (
          <div className="text-xs text-slate-500 mt-2">
            Tidak ada produk yang diizinkan di unit ini.
          </div>
        )}
      </Section>

      {/* SOCIAL */}
      <Section title="Social Aid">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-2 w-[18%]">Nama</th>
              <th className="p-2 w-[12%]">Role</th>
              <ProductHeads list={colsSOC} />
            </tr>
          </thead>
          <tbody>
            {peopleSOC.map((p) => (
              <PersonRow
                key={p.id}
                p={p}
                ppIdx={ppIdx}
                targets={targets}
                productConfigs={colsSOC}
                allowed={allowed}
              />
            ))}
          </tbody>
        </table>
        {colsSOC.length === 0 && (
          <div className="text-xs text-slate-500 mt-2">
            Tidak ada produk yang diizinkan di unit ini.
          </div>
        )}
      </Section>

      {/* SGK */}
      <Section title="SGK (Langsung oleh BM)">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-2 w-[18%]">Nama</th>
              <th className="p-2 w-[12%]">Role</th>
              <ProductHeads list={colsSGK} />
            </tr>
          </thead>
          <tbody>
            {peopleSGK.map((p) => (
              <PersonRow
                key={p.id}
                p={p}
                ppIdx={ppIdx}
                targets={targets}
                productConfigs={colsSGK}
                allowed={allowed}
              />
            ))}
          </tbody>
        </table>
        {colsSGK.length === 0 && (
          <div className="text-xs text-slate-500 mt-2">
            Tidak ada produk yang diizinkan di unit ini.
          </div>
        )}
      </Section>
    </div>
  );
}

function PersonRow({
  p,
  ppIdx,
  targets,
  productConfigs,
  allowed,
}: {
  p: Person;
  ppIdx: Map<string, Map<string, number>>;
  targets: TargetsPP;
  productConfigs: ProductConfig[];
  allowed: AllowedMap;
}) {
  return (
    <tr className="border-t align-top">
      <td className="p-2 font-medium min-w-0 truncate">{p.name}</td>
      <td className="p-2 text-slate-600 min-w-0 truncate">{p.role}</td>

      {productConfigs.map((cfg) => {
        const isAllowed = !!allowed?.[p.id]?.[cfg.name];
        if (!isAllowed)
          return (
            <td key={cfg.name} className="p-2 align-top text-slate-400">
              —
            </td>
          );
        const val = getPP(ppIdx, p.id, cfg.name);
        const tgt = getTarget(targets, p.id, cfg.name);
        const isMoney = cfg.type === "money";
        return (
          <td key={cfg.name} className="p-2 align-top">
            <ProductCell value={val} target={tgt} isMoney={isMoney} />
          </td>
        );
      })}
    </tr>
  );
}

function UnitBoard({
  unit,
  title,
  ach,
  unitTotal,
  targets,
  productConfigs,
  allowed,
  org,
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

  const ProductHeads = () => (
    <>
      {cols.map((cfg) => (
        <th key={cfg.name} className="p-2 w-[22%] text-right">
          {cfg.name}
        </th>
      ))}
    </>
  );

  return (
    <div className="space-y-4">
      <Section
        title={title}
        extra={
          <div className="text-sm text-slate-500">
            Total unit: {nfmt(unitTotal(unit))}
          </div>
        }
      >
        <table className="w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-2 w-[18%]">Nama</th>
              <th className="p-2 w-[12%]">Role</th>
              <ProductHeads />
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <PersonRow
                key={p.id}
                p={p}
                ppIdx={ppIdx}
                targets={targets}
                productConfigs={cols}
                allowed={allowed}
              />
            ))}
          </tbody>
        </table>
        {cols.length === 0 && (
          <div className="text-xs text-slate-500 mt-2">
            Tidak ada produk yang diizinkan di unit ini.
          </div>
        )}
      </Section>

      <Section title="Detail Input Terakhir">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-2 w-[24%]">Tanggal</th>
              <th className="p-2 w-[26%]">Nama</th>
              <th className="p-2 w-[36%]">Produk</th>
              <th className="p-2 w-[14%] text-right">Nilai</th>
            </tr>
          </thead>
          <tbody>
            {ach
              .filter((a) => org.find((p) => p.id === a.personId)?.unit === unit)
              .slice(-25)
              .reverse()
              .map((a) => (
                <tr key={a.id} className="border-t align-top">
                  <td className="p-2 whitespace-nowrap">{a.date}</td>
                  <td className="p-2 min-w-0 truncate">
                    {org.find((p) => p.id === a.personId)?.name}
                  </td>
                  <td className="p-2 min-w-0 break-words">{a.product}</td>
                  <td className="p-2 text-right whitespace-nowrap">
                    {nfmt(a.amount)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function Individuals({
  ach,
  productConfigs,
  targets,
  allowed,
  org,
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
      {org
        .filter((p) => p.unit !== "LEAD" && !["MBM", "BOS"].includes(p.role))
        .map((p) => (
          <Section key={p.id} title={`${p.name} — ${p.role}`}>
            <div className="grid md:grid-cols-3 gap-3">
              {productConfigs
                .filter((cfg) => !!allowed?.[p.id]?.[cfg.name])
                .map((cfg) => {
                  const val = getPP(ppIdx, p.id, cfg.name);
                  const tgt = getTarget(targets, p.id, cfg.name);
                  return (
                    <div key={cfg.name} className="p-3 rounded-xl border">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm text-slate-600">{cfg.name}</div>
                        <div className="text-sm font-medium">
                          {cfg.type === "money" ? nfmt(val) : val}
                        </div>
                      </div>
                      <PBar value={val} target={tgt} />
                    </div>
                  );
                })}
              <div className="text-xs text-slate-500 md:col-span-3">
                * Produk bertipe “Money” ditampilkan sebagai rupiah; “Unit” sebagai jumlah.
              </div>
            </div>
          </Section>
        ))}
    </div>
  );
}

/* ===================================================
   PANEL INPUT (BM) – lengkap + kelompok PIC + REKAP BULANAN
   =================================================== */

function InputPanel({
  pinOk,
  setPinOk,
  form,
  setForm,
  addAchievement,
  ach,
  removeAchievement,
  targets,
  setTargets,
  productConfigs,
  setProductConfigs,
  allowed,
  setAllowed,
  org,
  setOrg,
  setAch,
  picCategory,
  setPicCategory,
}: {
  pinOk: boolean;
  setPinOk: Dispatch<SetStateAction<boolean>>;
  form: { personId: string; product: string; amount: string; date: string };
  setForm: Dispatch<
    SetStateAction<{ personId: string; product: string; amount: string; date: string }>
  >;
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
  picCategory: PersonCategoryMap;
  setPicCategory: Dispatch<SetStateAction<PersonCategoryMap>>;
}) {
  const [newProd, setNewProd] = useState("");
  const [newType, setNewType] = useState<ProductType>("money");

  // --- Kelola Pegawai
  const [newEmp, setNewEmp] = useState<{ name: string; role: string; unit: Person["unit"] }>(
    {
      name: "",
      role: "SGP",
      unit: "MBM",
    },
  );

  const ensureTargetsForProducts = (names: string[], people: Person[]) => {
    setTargets((prev) => {
      const next = { ...(prev || {}) };
      people.forEach((p) => {
        if (p.unit === "LEAD") return;
        next[p.id] = next[p.id] || {};
        names.forEach((n) => {
          if (next[p.id][n] === undefined) next[p.id][n] = 0;
        });
      });
      save(K_TGT_PP, next);
      return next;
    });
  };
  const ensureAllowedForProducts = (
    names: string[],
    people: Person[],
    defaultAllowed = true,
  ) => {
    setAllowed((prev) => {
      const next = { ...(prev || {}) };
      people.forEach((p) => {
        if (p.unit === "LEAD") return;
        next[p.id] = next[p.id] || {};
        names.forEach((n) => {
          if (next[p.id][n] === undefined) next[p.id][n] = defaultAllowed;
        });
      });
      save(K_ALLOWED, next);
      return next;
    });
  };

  const addProduct = () => {
    const name = newProd.trim();
    if (!name) return;
    if (productConfigs.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      alert("Produk sudah ada.");
      return;
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
    if (!confirm(`Hapus kolom produk "${name}"? Data target & izin lama tetap tersimpan.`))
      return;
    const next = productConfigs.filter((c) => c.name !== name);
    setProductConfigs(next);
    save(K_FP, next);
  };

  const productNames = productConfigs.map((c) => c.name);

  // daftar produk yang boleh untuk person terpilih (untuk dropdown)
  const allowedListForSelected = form.personId
    ? productConfigs
        .filter((cfg) => !!allowed?.[form.personId]?.[cfg.name])
        .map((c) => c.name)
    : [];

  const canAdd =
    !!form.personId &&
    !!form.product &&
    !!form.amount &&
    !!allowed?.[form.personId]?.[form.product];

  // --- Tambah/Hapus Pegawai
  const addEmployee = () => {
    const name = newEmp.name.trim();
    if (!name) return alert("Nama wajib diisi.");
    const id = `emp-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${uid()}`;
    const person: Person = { id, name, role: newEmp.role.trim() || "Staff", unit: newEmp.unit };
    const next = [...org, person];
    setOrg(next);
    save(K_ORG, next);

    // kategori default untuk pegawai baru
    setPicCategory((prev) => {
      const nextMap = { ...(prev || {}) };
      nextMap[id] = defaultCategoryForPerson(person);
      save(K_PIC_CAT, nextMap);
      return nextMap;
    });

    // buat key target & izin untuk pegawai baru
    ensureTargetsForProducts(productNames, [person]);
    ensureAllowedForProducts(productNames, [person], true);

    setNewEmp({ name: "", role: "SGP", unit: "MBM" });
  };

  const deleteEmployee = (id: string) => {
    const emp = org.find((o) => o.id === id);
    if (!emp) return;
    if (emp.unit === "LEAD") return alert("Pegawai LEAD tidak bisa dihapus.");
    if (!confirm(`Hapus pegawai "${emp.name}"? Semua perolehan terkait juga akan dihapus.`))
      return;
    // hapus dari org
    const nextOrg = org.filter((o) => o.id !== id);
    setOrg(nextOrg);
    save(K_ORG, nextOrg);
    // bersihkan targets & izin
    setTargets((prev) => {
      const cur = { ...(prev || {}) };
      delete cur[id];
      save(K_TGT_PP, cur);
      return cur;
    });
    setAllowed((prev) => {
      const cur = { ...(prev || {}) };
      delete cur[id];
      save(K_ALLOWED, cur);
      return cur;
    });
    // bersihkan kategori
    setPicCategory((prev) => {
      const cur = { ...(prev || {}) };
      delete cur[id];
      save(K_PIC_CAT, cur);
      return cur;
    });
    // hapus semua achievements pegawai ini
    removeAllAchievementsOf(id);
    // reset pilihan form kalau sedang menunjuk ke pegawai ini
    setForm((f) => (f.personId === id ? { ...f, personId: "", product: "" } : f));
  };

  const removeAllAchievementsOf = (personId: string) => {
    setAch((s: Achievement[]) => s.filter((a: Achievement) => a.personId !== personId));
  };

  /* -------------------------
     REKAP BULANAN (CSV + Leaderboard)
     ------------------------- */

  const [month, setMonth] = useState(() => today().slice(0, 7)); // "YYYY-MM"

  // util filter bulan
  const inMonth = (d: string, ym: string) => d.slice(0, 7) === ym;

  // index bulanan orang->produk
  const monthPPIdx = useMemo(() => {
    const idx = new Map<string, Map<string, number>>();
    for (const a of ach) {
      if (!inMonth(a.date, month)) continue;
      if (!idx.has(a.personId)) idx.set(a.personId, new Map());
      const m = idx.get(a.personId)!;
      m.set(a.product, (m.get(a.product) || 0) + (Number(a.amount) || 0));
    }
    return idx;
  }, [ach, month]);

  // hitung total2 per orang (money & unit) + skor fairness
  type PersonMonthRow = {
    personId: string;
    name: string;
    role: string;
    unit: Person["unit"];
    category: PersonCategory;
    perProduct: Record<string, number>;
    totalMoney: number;
    totalUnit: number;
    score: number; // rata2 min(ach/target,1) across produk yg punya target>0 & diizinkan
    countedProducts: number;
  };

  const catOf = (pid: string) =>
    picCategory[pid] ??
    defaultCategoryForPerson(org.find((p) => p.id === pid) || ({} as Person));

  const rowsForMonth: PersonMonthRow[] = useMemo(() => {
    const list: PersonMonthRow[] = [];
    const productNames = productConfigs.map((p) => p.name);
    for (const p of org) {
      if (p.unit === "LEAD") continue;
      const perProduct: Record<string, number> = {};
      let totalMoney = 0;
      let totalUnit = 0;
      let sumRatio = 0;
      let cnt = 0;

      for (const cfg of productConfigs) {
        const allowedHere = !!allowed?.[p.id]?.[cfg.name];
        const val = allowedHere ? Number(monthPPIdx.get(p.id)?.get(cfg.name) || 0) : 0;
        perProduct[cfg.name] = val;
        if (cfg.type === "money") totalMoney += val;
        else totalUnit += val;

        const tgt = getTarget(targets, p.id, cfg.name);
        if (allowedHere && tgt > 0) {
          const ratio = Math.min(1, val / tgt);
          sumRatio += ratio;
          cnt += 1;
        }
      }

      const score = cnt > 0 ? sumRatio / cnt : 0;
      list.push({
        personId: p.id,
        name: p.name,
        role: p.role,
        unit: p.unit,
        category: catOf(p.id),
        perProduct,
        totalMoney,
        totalUnit,
        score,
        countedProducts: cnt,
      });
    }
    // hanya tampilkan bila ada kontribusi apapun di bulan tsb (atau ada target?—pilih kontribusi)
    return list.filter(
      (r) =>
        Object.values(r.perProduct).some((v) => v > 0) ||
        r.countedProducts > 0,
    );
  }, [org, productConfigs, allowed, monthPPIdx, targets, picCategory]);

  // leaderboard per kategori
  const leaderboardMikro = useMemo(
    () =>
      rowsForMonth
        .filter((r) => r.category === "MIKRO")
        .sort((a, b) => (b.score - a.score) || (b.totalMoney + b.totalUnit - (a.totalMoney + a.totalUnit))),
    [rowsForMonth],
  );
  const leaderboardOperasional = useMemo(
    () =>
      rowsForMonth
        .filter((r) => r.category === "OPERASIONAL")
        .sort((a, b) => (b.score - a.score) || (b.totalMoney + b.totalUnit - (a.totalMoney + a.totalUnit))),
    [rowsForMonth],
  );

  // export CSV
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const toCSV = (arr: string[][]) =>
    arr.map((row) =>
      row
        .map((cell) => {
          const s = cell ?? "";
          // escape comma/quote/newline
          if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(","),
    ).join("\n");

  const exportMonthCSV = () => {
    const prodNames = productConfigs.map((p) => p.name);

    const header = [
      "Month",
      "PersonID",
      "Name",
      "Role",
      "Unit",
      "Category",
      ...prodNames, // nilai per produk
      "TotalMoney",
      "TotalUnit",
      "Score(0-1)",
      "CountedProducts",
    ];

    const rows: string[][] = [header];

    for (const r of rowsForMonth) {
      rows.push([
        month,
        r.personId,
        r.name,
        r.role,
        r.unit,
        r.category,
        ...prodNames.map((n) => String(r.perProduct[n] ?? 0)),
        String(r.totalMoney),
        String(r.totalUnit),
        r.score.toFixed(3),
        String(r.countedProducts),
      ]);
    }

    // Tambahkan 2 tabel leaderboard di bawah (dalam file yg sama)
    rows.push([]);
    rows.push([`Leaderboard MIKRO (${month})`]);
    rows.push(["Rank", "Name", "Role", "Unit", "Score(0-1)", "TotalMoney", "TotalUnit"]);
    leaderboardMikro.forEach((r, i) => {
      rows.push([
        String(i + 1),
        r.name,
        r.role,
        r.unit,
        r.score.toFixed(3),
        String(r.totalMoney),
        String(r.totalUnit),
      ]);
    });

    rows.push([]);
    rows.push([`Leaderboard OPERASIONAL (${month})`]);
    rows.push(["Rank", "Name", "Role", "Unit", "Score(0-1)", "TotalMoney", "TotalUnit"]);
    leaderboardOperasional.forEach((r, i) => {
      rows.push([
        String(i + 1),
        r.name,
        r.role,
        r.unit,
        r.score.toFixed(3),
        String(r.totalMoney),
        String(r.totalUnit),
      ]);
    });

    const csv = toCSV(rows);
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `rekap_${month}.csv`);
  };

  const [showLB, setShowLB] = useState(false);

  /* ------------------------- UI ------------------------- */

  return (
    <div className="space-y-4">
      {!pinOk ? (
        <Section title="Masuk sebagai Branch Manager">
          <div className="flex items-center gap-2">
            <input
              id="pin"
              className="px-3 py-2 rounded-xl border w-64"
              placeholder="Masukkan PIN"
              type="password"
            />
            <button
              className="px-3 py-2 rounded-xl bg-indigo-600 text-white flex items-center gap-2"
              onClick={() => {
                const v = (document.getElementById("pin") as HTMLInputElement).value;
                if (v === "MANDIRI123") setPinOk(true);
                else alert("PIN salah");
              }}
            >
              <Unlock size={16} /> Masuk
            </button>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            * Sementara pakai PIN lokal. Bisa dipindah ke backend nanti.
          </div>
        </Section>
      ) : (
        <>
          <Section
            title="Input Perolehan (BM Only)"
            extra={
              <button className="px-3 py-1.5 rounded-lg border" onClick={() => setPinOk(false)}>
                <Lock size={14} /> Kunci
              </button>
            }
          >
            <div className="grid md:grid-cols-4 gap-3 items-end">
              <div>
                <div className="text-sm mb-1">Nama</div>
                <select
                  className="px-3 py-2 rounded-xl border w-full"
                  value={form.personId}
                  onChange={(e) => setForm({ ...form, personId: e.target.value })}
                >
                  <option value="">— Pilih —</option>
                  {org
                    .filter((p) => p.unit !== "LEAD")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.role})
                      </option>
                    ))}
                </select>
              </div>

              {/* Produk: difilter izin */}
              <div>
                <div className="text-sm mb-1">Produk</div>
                <select
                  className="px-3 py-2 rounded-xl border w-full"
                  value={form.product}
                  onChange={(e) => setForm({ ...form, product: e.target.value })}
                  disabled={
                    !form.personId ||
                    productConfigs.length === 0 ||
                    allowedListForSelected.length === 0
                  }
                >
                  <option value="">
                    {!form.personId
                      ? "Pilih nama dulu"
                      : allowedListForSelected.length
                      ? "— Pilih Produk —"
                      : "Pegawai ini belum diizinkan produk apapun"}
                  </option>
                  {productConfigs
                    .filter((cfg) => !!allowed?.[form.personId]?.[cfg.name])
                    .map((cfg) => (
                      <option key={cfg.name} value={cfg.name}>
                        {cfg.name}
                      </option>
                    ))}
                </select>
                <div className="text-xs text-slate-500 mt-1">
                  Sumber: Kelola Kolom Produk + Izin Pegawai
                </div>
              </div>

              <div>
                <div className="text-sm mb-1">Nilai</div>
                <input
                  className="px-3 py-2 rounded-xl border w-full"
                  type="number"
                  inputMode="numeric"
                  placeholder="contoh: 5000000 / 1"
                  value={form.amount}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const sanitized = raw.replace(/[^\d]/g, "");
                    setForm({ ...form, amount: sanitized });
                  }}
                />
              </div>

              <div>
                <div className="text-sm mb-1">Tanggal</div>
                <input
                  className="px-3 py-2 rounded-xl border w-full"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>

              <div className="md:col-span-4">
                <button
                  className={`px-3 py-2 rounded-xl ${
                    canAdd
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-200 text-slate-500"
                  } flex items-center gap-2`}
                  onClick={() => {
                    if (canAdd) addAchievement();
                  }}
                  disabled={!canAdd}
                  title={
                    canAdd
                      ? ""
                      : "Lengkapi data dan pastikan produk diizinkan untuk pegawai tersebut"
                  }
                >
                  <Plus size={16} /> Tambah
                </button>
              </div>
            </div>
          </Section>

          {/* Kelola kolom produk dinamis */}
          <Section title="Kelola Kolom Produk (Target & Progress)">
            <div className="grid md:grid-cols-4 gap-3 items-end">
              <div className="md:col-span-2">
                <div className="text-sm mb-1">Nama Produk</div>
                <input
                  className="px-3 py-2 rounded-xl border w-full"
                  placeholder='mis: "KUM"'
                  value={newProd}
                  onChange={(e) => setNewProd(e.target.value)}
                />
              </div>
              <div>
                <div className="text-sm mb-1">Tipe</div>
                <select
                  className="px-3 py-2 rounded-xl border w-full"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as ProductType)}
                >
                  <option value="money">Money (Rp)</option>
                  <option value="unit">Unit (pcs)</option>
                </select>
              </div>
              <div>
                <button className="px-3 py-2 rounded-xl border" onClick={addProduct}>
                  Tambah Kolom
                </button>
              </div>
            </div>

            {productConfigs.length > 0 && (
              <div className="mt-3 grid md:grid-cols-3 gap-2">
                {productConfigs.map((cfg) => (
                  <div
                    key={cfg.name}
                    className="px-3 py-2 rounded-xl border flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium">{cfg.name}</div>
                      <div className="text-xs text-slate-500">
                        {cfg.type === "money" ? "Money (Rp)" : "Unit"}
                      </div>
                    </div>
                    <button
                      className="p-1 rounded-lg border"
                      onClick={() => removeProduct(cfg.name)}
                      title="Hapus kolom"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="text-xs text-slate-500 mt-2">
              * Menghapus kolom tidak menghapus data target/izin lama (tetap tersimpan).
            </div>
          </Section>

          {/* Izin produk per pegawai */}
          <Section title="Izin Produk per Pegawai">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-2 w-[34%]">Nama</th>
                  <th className="p-2 w-[18%]">Role</th>
                  {productConfigs.map((cfg) => (
                    <th key={cfg.name} className="p-2 text-center">
                      {cfg.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {org
                  .filter((p) => p.unit !== "LEAD")
                  .map((p) => (
                    <tr key={p.id} className="border-t align-top">
                      <td className="p-2 min-w-0 truncate">{p.name}</td>
                      <td className="p-2 min-w-0 truncate text-slate-600">{p.role}</td>
                      {productConfigs.map((cfg) => (
                        <td key={cfg.name} className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={!!allowed?.[p.id]?.[cfg.name]}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setAllowed((prev) => {
                                const cur = { ...(prev || {}) };
                                cur[p.id] = cur[p.id] || {};
                                cur[p.id][cfg.name] = checked;
                                save(K_ALLOWED, cur);
                                return { ...cur };
                              });
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className="text-xs text-slate-500 mt-2">
              Centang produk yang boleh dipasarkan oleh pegawai.
            </div>
          </Section>

          {/* Kelompok PIC (MIKRO / OPERASIONAL) */}
          <Section
            title="Kelompok PIC (Mikro / Operasional)"
            extra={
              <Link to="/pic" className="px-3 py-1.5 rounded-lg border bg-white">
                Buka Halaman PIC →
              </Link>
            }
          >
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-2 w-[36%]">Nama</th>
                  <th className="p-2 w-[20%]">Role</th>
                  <th className="p-2 w-[24%]">Kategori</th>
                </tr>
              </thead>
              <tbody>
                {org
                  .filter((p) => p.unit !== "LEAD")
                  .map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-2 min-w-0 truncate">{p.name}</td>
                      <td className="p-2 min-w-0 truncate text-slate-600">{p.role}</td>
                      <td className="p-2">
                        <select
                          className="px-2 py-1 rounded-lg border"
                          value={picCategory[p.id] || defaultCategoryForPerson(p)}
                          onChange={(e) => {
                            const val = e.target.value as PersonCategory;
                            setPicCategory((prev) => {
                              const next = { ...(prev || {}) };
                              next[p.id] = val;
                              save(K_PIC_CAT, next);
                              return next;
                            });
                          }}
                        >
                          <option value="MIKRO">Mikro</option>
                          <option value="OPERASIONAL">Operasional</option>
                        </select>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <div className="text-xs text-slate-500 mt-2">
              * Default: Security/SGK/SOCIAL ⇒ Operasional, lainnya ⇒ Mikro.
            </div>
          </Section>

          {/* Target per ORANG per PRODUK (hanya aktif jika diizinkan) */}
          <Section title="Target per Orang • per Produk">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-2 w-[34%]">Nama</th>
                  <th className="p-2 w-[18%]">Role</th>
                  {productConfigs.map((cfg) => (
                    <th key={cfg.name} className="p-2 text-right">
                      {cfg.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {org
                  .filter((p) => p.unit !== "LEAD")
                  .map((p) => (
                    <tr key={p.id} className="border-t align-top">
                      <td className="p-2 min-w-0 truncate">{p.name}</td>
                      <td className="p-2 min-w-0 truncate text-slate-600">{p.role}</td>
                      {productConfigs.map((cfg) => {
                        const enabled = !!allowed?.[p.id]?.[cfg.name];
                        return (
                          <td key={cfg.name} className="p-2 text-right">
                            <input
                              className={`px-2 py-1 rounded-lg border w-32 text-right ${
                                enabled ? "" : "bg-slate-100 text-slate-400"
                              }`}
                              type="number"
                              inputMode="numeric"
                              value={String(targets?.[p.id]?.[cfg.name] ?? "")}
                              onChange={(e) => {
                                const v = e.target.value.replace(/[^\d]/g, "");
                                setTargets((prev) => {
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
            <div className="text-xs text-slate-500 mt-2">
              * Hanya produk yang diizinkan yang bisa diisi targetnya.
            </div>
          </Section>

          {/* Kelola Pegawai */}
          <Section title="Kelola Pegawai">
            <div className="grid md:grid-cols-5 gap-3 items-end">
              <div className="md:col-span-2">
                <div className="text-sm mb-1">Nama</div>
                <input
                  className="px-3 py-2 rounded-xl border w-full"
                  value={newEmp.name}
                  onChange={(e) => setNewEmp((v) => ({ ...v, name: e.target.value }))}
                />
              </div>
              <div>
                <div className="text-sm mb-1">Role</div>
                <input
                  className="px-3 py-2 rounded-xl border w-full"
                  placeholder="mis: SGP / Teller / CS"
                  value={newEmp.role}
                  onChange={(e) => setNewEmp((v) => ({ ...v, role: e.target.value }))}
                />
              </div>
              <div>
                <div className="text-sm mb-1">Unit</div>
                <select
                  className="px-3 py-2 rounded-xl border w-full"
                  value={newEmp.unit}
                  onChange={(e) =>
                    setNewEmp((v) => ({ ...v, unit: e.target.value as Person["unit"] }))
                  }
                >
                  <option value="MBM">MBM</option>
                  <option value="BOS">BOS</option>
                  <option value="SOCIAL">SOCIAL</option>
                  <option value="SGK">SGK</option>
                </select>
              </div>
              <div>
                <button className="px-3 py-2 rounded-xl border" onClick={addEmployee}>
                  Tambah Pegawai
                </button>
              </div>
            </div>

            <div className="mt-4">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="p-2 w-[36%]">Nama</th>
                    <th className="p-2 w-[20%]">Role</th>
                    <th className="p-2 w-[16%]">Unit</th>
                    <th className="p-2 w-[12%] text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {org.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-2 min-w-0 truncate">{p.name}</td>
                      <td className="p-2 min-w-0 truncate text-slate-600">{p.role}</td>
                      <td className="p-2">{p.unit}</td>
                      <td className="p-2 text-right">
                        <button
                          className="px-2 py-1 rounded-lg border"
                          onClick={() => deleteEmployee(p.id)}
                          disabled={p.unit === "LEAD"}
                          title={p.unit === "LEAD" ? "LEAD tidak bisa dihapus" : "Hapus pegawai"}
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-xs text-slate-500 mt-2">
                * Menghapus pegawai akan menghapus perolehan, target, izin, dan kategori PIC terkait.
              </div>
            </div>
          </Section>

          <Section
            title="Rekap Bulanan & Leaderboard (Fair Ranking)"
            extra={<div className="text-sm text-slate-500">CSV bisa dibuka di Excel</div>}
          >
            <div className="grid md:grid-cols-5 gap-3 items-end">
              <div className="md:col-span-2">
                <div className="text-sm mb-1">Bulan</div>
                <input
                  className="px-3 py-2 rounded-xl border w-full"
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </div>
              <div className="flex gap-2 md:col-span-3">
                <button className="px-3 py-2 rounded-xl border" onClick={exportMonthCSV}>
                  Download Rekap (CSV)
                </button>
                <button
                  className="px-3 py-2 rounded-xl border"
                  onClick={() => setShowLB((v) => !v)}
                >
                  {showLB ? "Sembunyikan Leaderboard" : "Lihat Leaderboard"}
                </button>
              </div>
            </div>

            {showLB && (
              <div className="mt-4 grid md:grid-cols-2 gap-4">
                <div className="p-3 rounded-xl border bg-white">
                  <div className="font-semibold mb-2">Leaderboard Mikro — {month}</div>
                  <table className="w-full table-fixed text-sm">
                    <thead className="bg-slate-50 text-left">
                      <tr>
                        <th className="p-2 w-[10%]">#</th>
                        <th className="p-2 w-[40%]">Nama</th>
                        <th className="p-2 w-[20%] text-right">Score</th>
                        <th className="p-2 w-[30%] text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboardMikro.map((r, i) => (
                        <tr key={r.personId} className="border-t">
                          <td className="p-2">{i + 1}</td>
                          <td className="p-2 min-w-0 truncate">{r.name}</td>
                          <td className="p-2 text-right">{(r.score * 100).toFixed(1)}%</td>
                          <td className="p-2 text-right">{nfmt(r.totalMoney + r.totalUnit)}</td>
                        </tr>
                      ))}
                      {leaderboardMikro.length === 0 && (
                        <tr>
                          <td className="p-2 text-slate-500" colSpan={4}>
                            Belum ada data bulan ini.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="p-3 rounded-xl border bg-white">
                  <div className="font-semibold mb-2">Leaderboard Operasional — {month}</div>
                  <table className="w-full table-fixed text-sm">
                    <thead className="bg-slate-50 text-left">
                      <tr>
                        <th className="p-2 w-[10%]">#</th>
                        <th className="p-2 w-[40%]">Nama</th>
                        <th className="p-2 w-[20%] text-right">Score</th>
                        <th className="p-2 w-[30%] text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboardOperasional.map((r, i) => (
                        <tr key={r.personId} className="border-t">
                          <td className="p-2">{i + 1}</td>
                          <td className="p-2 min-w-0 truncate">{r.name}</td>
                          <td className="p-2 text-right">{(r.score * 100).toFixed(1)}%</td>
                          <td className="p-2 text-right">{nfmt(r.totalMoney + r.totalUnit)}</td>
                        </tr>
                      ))}
                      {leaderboardOperasional.length === 0 && (
                        <tr>
                          <td className="p-2 text-slate-500" colSpan={4}>
                            Belum ada data bulan ini.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>

          <Section title="Log Input Terbaru">
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-2 w-[24%]">Tanggal</th>
                  <th className="p-2 w-[26%]">Nama</th>
                  <th className="p-2 w-[36%]">Produk</th>
                  <th className="p-2 w-[14%] text-right">Nilai</th>
                  <th className="p-2 w-[14%]">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {ach
                  .slice(-50)
                  .reverse()
                  .map((a) => {
                    const p = org.find((x) => x.id === a.personId)!;
                    return (
                      <tr key={a.id} className="border-t align-top">
                        <td className="p-2 whitespace-nowrap">{a.date}</td>
                        <td className="p-2 min-w-0 truncate">{p?.name}</td>
                        <td className="p-2 min-w-0 break-words">{a.product}</td>
                        <td className="p-2 text-right whitespace-nowrap">{nfmt(a.amount)}</td>
                        <td className="p-2">
                          <button
                            className="px-2 py-1 rounded-lg border"
                            onClick={() => removeAchievement(a.id)}
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </Section>
        </>
      )}
    </div>
  );
}

/* ===================================================
   PIC INPUT (tanpa PIN) - route /pic
   =================================================== */

function PicInputPage({
  org,
  products,
  allowed,
  picCategory,
  onAdded,
}: {
  org: Person[];
  products: ProductConfig[];
  allowed: AllowedMap;
  picCategory: PersonCategoryMap;
  onAdded?: (row: Achievement) => void;
}) {
  const nav = useNavigate();

  type Kategori = "Mikro" | "Operasional";
  const [kategori, setKategori] = useState<Kategori>("Mikro");

  const filteredPeople = useMemo(
    () =>
      org.filter(
        (p) =>
          p.unit !== "LEAD" &&
          (picCategory?.[p.id] || defaultCategoryForPerson(p)) ===
            (kategori === "Operasional" ? "OPERASIONAL" : "MIKRO"),
      ),
    [org, kategori, picCategory],
  );

  const [personId, setPersonId] = useState<string>("");
  const allowedProducts = useMemo(
    () =>
      personId ? products.filter((cfg) => !!allowed?.[personId]?.[cfg.name]) : [],
    [personId, products, allowed],
  );

  const [product, setProduct] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const canSave = personId && product && amount;

  const submit = async () => {
    if (!canSave) return;
    const body = { personId, product, amount: Number(amount), date };
    const res = await api<{ ok: boolean; id?: string; error?: string }>("/api/achievements", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      alert(res.error || "Gagal menyimpan");
      return;
    }
    onAdded?.({
      id: res.id || uid(),
      personId,
      product,
      amount: Number(amount),
      date,
    });
    setAmount("");
    alert("Perolehan tersimpan.");
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="w-full px-6 py-3 flex items-center gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-600" />
            <div>
              <div className="font-semibold">Input Perolehan (PIC)</div>
              <div className="text-xs text-slate-500">Tanpa login • Simpan langsung ke DB</div>
            </div>
          </div>
          <div className="flex-1" />
          <Link to="/" className="px-3 py-2 rounded-xl border bg-white">
            ← Kembali ke Dashboard
          </Link>
        </div>
      </header>

      <main className="w-full max-w-3xl mx-auto px-6 py-6 space-y-4">
        <Section title="Form Input">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="text-sm mb-1">Kategori</div>
              <select
                className="px-3 py-2 rounded-xl border w-full"
                value={kategori}
                onChange={(e) => {
                  setKategori(e.target.value as Kategori);
                  setPersonId("");
                  setProduct("");
                }}
              >
                <option value="Mikro">Mikro</option>
                <option value="Operasional">Operasional</option>
              </select>
              <div className="text-xs text-slate-500 mt-1">
                Sumber: pengelompokan BM (Kelompok PIC).
              </div>
            </div>

            <div>
              <div className="text-sm mb-1">Nama</div>
              <select
                className="px-3 py-2 rounded-xl border w-full"
                value={personId}
                onChange={(e) => {
                  setPersonId(e.target.value);
                  setProduct("");
                }}
              >
                <option value="">— Pilih —</option>
                {filteredPeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-sm mb-1">Produk</div>
              <select
                className="px-3 py-2 rounded-xl border w-full"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                disabled={!personId || allowedProducts.length === 0}
              >
                <option value="">
                  {personId
                    ? allowedProducts.length
                      ? "— Pilih Produk —"
                      : "Pegawai ini belum diizinkan produk apapun"
                    : "Pilih nama dulu"}
                </option>
                {allowedProducts.map((cfg) => (
                  <option key={cfg.name} value={cfg.name}>
                    {cfg.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-sm mb-1">Nilai</div>
              <input
                className="px-3 py-2 rounded-xl border w-full"
                inputMode="numeric"
                type="number"
                placeholder="contoh: 5000000 / 1"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              />
            </div>

            <div>
              <div className="text-sm mb-1">Tanggal</div>
              <input
                className="px-3 py-2 rounded-xl border w-full"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="md:col-span-2">
              <button
                className={`px-4 py-2 rounded-xl ${
                  personId && product && amount ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500"
                }`}
                onClick={submit}
                disabled={!(personId && product && amount)}
              >
                Simpan
              </button>
              <button
                className="ml-2 px-4 py-2 rounded-xl border"
                onClick={() => nav(0)}
                title="Refresh Data"
              >
                Refresh
              </button>
            </div>
          </div>
        </Section>
      </main>
    </div>
  );
}

/* ===================================================
   PORTAL (Dashboard) — memakai state bersama dari App
   =================================================== */

function PortalApp({
  org,
  setOrg,
  productConfigs,
  setProductConfigs,
  allowed,
  setAllowed,
  picCategory,
  setPicCategory,
}: {
  org: Person[];
  setOrg: Dispatch<SetStateAction<Person[]>>;
  productConfigs: ProductConfig[];
  setProductConfigs: Dispatch<SetStateAction<ProductConfig[]>>;
  allowed: AllowedMap;
  setAllowed: Dispatch<SetStateAction<AllowedMap>>;
  picCategory: PersonCategoryMap;
  setPicCategory: Dispatch<SetStateAction<PersonCategoryMap>>;
}) {
  const [ach, setAch] = useState<Achievement[]>(load<Achievement[]>(K_ACH, []));
  const [pinOk, setPinOk] = useState<boolean>(load<boolean>(K_PINOK, false));
  const [tab, setTab] = useState<
    "Overview" | "MBM" | "BOS" | "SOCIAL" | "SGK" | "Individuals" | "Input"
  >("Overview");

  // target per orang-per produk (masih lokal)
  const [targets, setTargets] = useState<TargetsPP>(() => load<TargetsPP>(K_TGT_PP, {}));
  useEffect(() => save(K_TGT_PP, targets), [targets]);

  // sinkronisasi saat daftar produk berubah
  useEffect(() => {
    const names = productConfigs.map((c) => c.name);
    setTargets((prev) => {
      const next = { ...(prev || {}) };
      org.forEach((p) => {
        if (p.unit === "LEAD") return;
        next[p.id] = next[p.id] || {};
        names.forEach((n) => {
          if (next[p.id][n] === undefined) next[p.id][n] = 0;
        });
      });
      save(K_TGT_PP, next);
      return next;
    });
    setAllowed((prev) => {
      const next = { ...(prev || {}) };
      org.forEach((p) => {
        if (p.unit === "LEAD") return;
        next[p.id] = next[p.id] || {};
        names.forEach((n) => {
          if (next[p.id][n] === undefined) next[p.id][n] = true;
        });
      });
      save(K_ALLOWED, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productConfigs.map((c) => c.name).join("|"), org.map((o) => o.id).join("|")]);

  useEffect(() => save(K_ACH, ach), [ach]);
  useEffect(() => save(K_PINOK, pinOk), [pinOk]);

  // statistik unit
  const totalsByPerson = useMemo(() => sumByPerson(ach), [ach]);
  const unitTotal = (unit: Person["unit"]) =>
    org
      .filter((p) => p.unit === unit && !["MBM", "BOS", "BM"].includes(p.role))
      .reduce((s, p) => s + (totalsByPerson.get(p.id) || 0), 0);

  // Input form state
  const [form, setForm] = useState<{
    personId: string;
    product: string;
    amount: string;
    date: string;
  }>(() => ({ personId: "", product: productConfigs[0]?.name ?? "", amount: "", date: today() }));

  // POST ke DB saat tambah
  const addAchievement = async () => {
    if (!form.personId || !form.product || !form.amount)
      return alert("Lengkapi data.");
    if (!allowed?.[form.personId]?.[form.product])
      return alert("Produk tidak diizinkan untuk pegawai ini.");
    const amount = Number(form.amount);
    if (Number.isNaN(amount) || amount < 0) return alert("Amount tidak valid.");

    const body = {
      personId: form.personId,
      product: form.product,
      amount,
      date: form.date,
    };
    const r = await api<{ ok: boolean; id?: string; error?: string }>(
      "/api/achievements",
      { method: "POST", body: JSON.stringify(body) },
    );
    if (!r.ok) return alert(r.error || "Gagal simpan ke DB");

    // Optimistic append:
    setAch((s) => [
      ...s,
      { id: r.id || uid(), personId: form.personId, product: form.product, amount, date: form.date },
    ]);
    setForm((f) => ({ ...f, amount: "" }));
  };

  const removeAchievement = (id: string) =>
    setAch((s) => s.filter((x) => x.id !== id));

  // Sesuaikan pilihan PRODUK saat person/izin berubah
  useEffect(() => {
    setForm((f) => {
      if (!f.personId) return f;
      const names = productConfigs
        .filter((cfg) => !!allowed?.[f.personId]?.[cfg.name])
        .map((c) => c.name);
      if (names.length === 0) return { ...f, product: "" };
      if (!names.includes(f.product)) return { ...f, product: names[0] };
      return f;
    });
  }, [form.personId, productConfigs, allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load awal dari API (org, products, achievements)
  useEffect(() => {
    (async () => {
      try {
        const p = await api<{ ok: boolean; rows: Person[] }>("/api/persons");
        if (p?.ok && p.rows?.length) {
          setOrg(p.rows);
          save(K_ORG, p.rows);
        }
      } catch {}
      try {
        const pr = await api<{ ok: boolean; rows: ProductConfig[] }>("/api/products");
        if (pr?.ok && pr.rows?.length) {
          setProductConfigs(pr.rows);
          save(K_FP, pr.rows);
        }
      } catch {}
      try {
        const a = await api<{ ok: boolean; rows: Achievement[] }>(
          "/api/achievements?limit=500",
        );
        if (a?.ok && Array.isArray(a.rows)) {
          setAch(a.rows);
          save(K_ACH, a.rows);
        }
      } catch {}
    })();
  }, [setOrg, setProductConfigs]);

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="w-full px-6 py-3 flex items-center gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-indigo-600" />
            <div>
              <div className="font-semibold">Sukamara Team Portal</div>
              <div className="text-xs text-slate-500">
                Connected DB • BM input & PIC page
              </div>
            </div>
          </div>

          <div className="flex-1" />

          {/* Nav */}
          <nav className="flex gap-2 items-center">
            <Link to="/pic" className="px-3 py-2 rounded-xl border bg-white">
              PIC Input
            </Link>
          </nav>
        </div>
      </header>

      {/* MAIN */}
      <main className="w-full px-6 py-4 space-y-4">
        <div className="flex gap-2 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(["Overview", "MBM", "BOS", "SOCIAL", "SGK", "Individuals", "Input"] as const).map(
            (t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-xl border transition-colors ${
                  tab === t
                    ? "bg-white text-indigo-600 font-semibold border-indigo-600"
                    : "bg-white hover:bg-slate-100"
                }`}
              >
                {t}
              </button>
            ),
          )}
        </div>

        {tab === "Overview" && (
          <Overview
            ach={ach}
            unitTotal={unitTotal}
            targets={targets}
            productConfigs={productConfigs}
            allowed={allowed}
            org={org}
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
            org={org}
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
            org={org}
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
            org={org}
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
            org={org}
          />
        )}
        {tab === "Individuals" && (
          <Individuals
            ach={ach}
            targets={targets}
            productConfigs={productConfigs}
            allowed={allowed}
            org={org}
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
            org={org}
            setOrg={setOrg}
            setAch={setAch}
            picCategory={picCategory}
            setPicCategory={setPicCategory}
          />
        )}

        <footer className="pt-6 text-sm text-slate-500 flex items-center gap-2">
          <CheckCircle2 size={16} /> Progress & konfigurasi target/izin disimpan lokal.
          Input perolehan tersimpan ke DB.
        </footer>
      </main>
    </div>
  );
}

/* ===================================================
   APP ROOT – state bersama (org, produk, izin, kategori) + ROUTES
   =================================================== */

export default function App() {
  // State bersama agar perubahan BM langsung terlihat di halaman PIC
  const [org, setOrg] = useState<Person[]>(() => load<Person[]>(K_ORG, DEFAULT_ORG));
  const [productConfigs, setProductConfigs] = useState<ProductConfig[]>(() =>
    load<ProductConfig[]>(K_FP, DEFAULT_PRODUCT_CONFIG),
  );
  const [allowed, setAllowed] = useState<AllowedMap>(() => load<AllowedMap>(K_ALLOWED, {}));
  const [picCategory, setPicCategory] = useState<PersonCategoryMap>(() =>
    load<PersonCategoryMap>(K_PIC_CAT, {}),
  );

  // Pastikan semua pegawai punya kategori (default heuristik)
  useEffect(() => {
    setPicCategory((prev) => {
      const next = { ...(prev || {}) };
      org.forEach((p) => {
        if (p.unit === "LEAD") return;
        if (!next[p.id]) next[p.id] = defaultCategoryForPerson(p);
      });
      save(K_PIC_CAT, next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.map((o) => o.id).join("|")]);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <PortalApp
            org={org}
            setOrg={setOrg}
            productConfigs={productConfigs}
            setProductConfigs={setProductConfigs}
            allowed={allowed}
            setAllowed={setAllowed}
            picCategory={picCategory}
            setPicCategory={setPicCategory}
          />
        }
      />
      <Route
        path="/pic"
        element={
          <PicInputPage
            org={org}
            products={productConfigs}
            allowed={allowed}
            picCategory={picCategory}
          />
        }
      />
    </Routes>
  );
}
