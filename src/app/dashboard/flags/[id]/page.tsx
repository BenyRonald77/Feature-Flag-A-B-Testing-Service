"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface Variant {
  id: string;
  key: string;
  name: string;
  trafficPercentage: number;
}

interface Flag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  type: "BOOLEAN" | "EXPERIMENT";
  enabled: boolean;
  rolloutPercentage: number;
  variants: Variant[];
}

interface VariantStats {
  variantKey: string;
  exposures: number;
  conversions: number;
  conversionRate: number;
}

export default function FlagDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [flag, setFlag] = useState<Flag | null>(null);
  const [stats, setStats] = useState<VariantStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolloutDraft, setRolloutDraft] = useState(0);
  const [variantForm, setVariantForm] = useState({ key: "", name: "", trafficPercentage: 10 });
  const [variantError, setVariantError] = useState<string | null>(null);

  async function loadFlag() {
    const res = await fetch(`/api/flags/${params.id}`);
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json();
    setFlag(data.flag);
    setRolloutDraft(data.flag.rolloutPercentage);
    setLoading(false);
  }

  async function loadStats() {
    const res = await fetch(`/api/flags/${params.id}/stats`);
    if (res.ok) {
      const data = await res.json();
      setStats(data.stats);
    }
  }

  useEffect(() => {
    loadFlag();
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function toggleEnabled() {
    if (!flag) return;
    const res = await fetch(`/api/flags/${flag.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !flag.enabled }),
    });
    if (res.ok) loadFlag();
  }

  async function saveRollout() {
    if (!flag) return;
    const res = await fetch(`/api/flags/${flag.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rolloutPercentage: rolloutDraft }),
    });
    if (res.ok) loadFlag();
  }

  async function handleAddVariant(event: FormEvent) {
    event.preventDefault();
    if (!flag) return;
    setVariantError(null);
    const res = await fetch(`/api/flags/${flag.id}/variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(variantForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setVariantError(data.error ?? "Gagal menambah variant");
      return;
    }
    setVariantForm({ key: "", name: "", trafficPercentage: 10 });
    loadFlag();
  }

  async function updateVariantTraffic(variantId: string, trafficPercentage: number) {
    if (!flag) return;
    const res = await fetch(`/api/flags/${flag.id}/variants/${variantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trafficPercentage }),
    });
    if (res.ok) loadFlag();
  }

  if (loading) {
    return <main className="p-10 text-slate-500">Memuat...</main>;
  }

  if (!flag) {
    return <main className="p-10 text-slate-500">Flag tidak ditemukan.</main>;
  }

  const totalTraffic = flag.variants.reduce((sum, v) => sum + v.trafficPercentage, 0);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-10">
      <Link href="/dashboard" className="mb-6 inline-block text-sm text-brand-600 hover:underline">
        ← Kembali ke daftar flag
      </Link>

      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-slate-500">{flag.key}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  flag.type === "BOOLEAN" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                }`}
              >
                {flag.type}
              </span>
            </div>
            <h1 className="mt-1 text-xl font-bold text-slate-800">{flag.name}</h1>
            {flag.description && <p className="mt-1 text-sm text-slate-500">{flag.description}</p>}
          </div>
          <button
            onClick={toggleEnabled}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              flag.enabled ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {flag.enabled ? "Aktif — klik untuk nonaktifkan" : "Nonaktif — klik untuk aktifkan"}
          </button>
        </div>

        {flag.type === "BOOLEAN" && (
          <div className="mt-6 border-t border-slate-100 pt-6">
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Rollout Percentage: {rolloutDraft}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={rolloutDraft}
              onChange={(e) => setRolloutDraft(Number(e.target.value))}
              className="w-full accent-brand-600"
            />
            <p className="mt-1 text-xs text-slate-400">
              Assignment dihitung ulang secara live per user (hash deterministik) sehingga menaikkan
              persentase bersifat monoton — user yang sudah dapat akses tidak akan pernah kehilangannya.
            </p>
            <button
              onClick={saveRollout}
              disabled={rolloutDraft === flag.rolloutPercentage}
              className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40"
            >
              Simpan Rollout
            </button>
          </div>
        )}
      </div>

      {flag.type === "EXPERIMENT" && (
        <div className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 font-semibold text-slate-800">Variant ({totalTraffic}% teralokasi)</h2>
          <div className="flex flex-col gap-3">
            {flag.variants.map((variant) => (
              <div key={variant.id} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                <div>
                  <span className="font-mono text-sm text-slate-600">{variant.key}</span>
                  <p className="text-sm text-slate-500">{variant.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={variant.trafficPercentage}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (value !== variant.trafficPercentage) updateVariantTraffic(variant.id, value);
                    }}
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                  />
                  <span className="text-sm text-slate-400">%</span>
                </div>
              </div>
            ))}
            {flag.variants.length === 0 && <p className="text-sm text-slate-500">Belum ada variant.</p>}
          </div>

          <form onSubmit={handleAddVariant} className="mt-5 flex items-end gap-3 border-t border-slate-100 pt-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Key</label>
              <input
                value={variantForm.key}
                onChange={(e) => setVariantForm((f) => ({ ...f, key: e.target.value }))}
                required
                className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Nama</label>
              <input
                value={variantForm.name}
                onChange={(e) => setVariantForm((f) => ({ ...f, name: e.target.value }))}
                required
                className="w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Traffic %</label>
              <input
                type="number"
                min={1}
                max={100}
                value={variantForm.trafficPercentage}
                onChange={(e) => setVariantForm((f) => ({ ...f, trafficPercentage: Number(e.target.value) }))}
                className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </div>
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
              Tambah
            </button>
          </form>
          {variantError && <p className="mt-2 text-sm text-red-600">{variantError}</p>}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Statistik Konversi per Variant</h2>
          <button onClick={loadStats} className="text-xs text-brand-600 hover:underline">
            Refresh
          </button>
        </div>
        {stats.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada data exposure/conversion.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2">Variant</th>
                <th className="py-2 text-right">Exposure</th>
                <th className="py-2 text-right">Konversi</th>
                <th className="py-2 text-right">Conversion Rate</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.variantKey} className="border-b border-slate-100">
                  <td className="py-2 font-mono">{s.variantKey}</td>
                  <td className="py-2 text-right">{s.exposures}</td>
                  <td className="py-2 text-right">{s.conversions}</td>
                  <td className="py-2 text-right font-medium text-brand-700">{(s.conversionRate * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
