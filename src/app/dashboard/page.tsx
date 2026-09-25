"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Flag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  type: "BOOLEAN" | "EXPERIMENT";
  enabled: boolean;
  rolloutPercentage: number;
  variants: { id: string; key: string; trafficPercentage: number }[];
}

export default function DashboardPage() {
  const router = useRouter();
  const [adminName, setAdminName] = useState<string | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"BOOLEAN" | "EXPERIMENT">("BOOLEAN");

  async function loadFlags() {
    const res = await fetch("/api/flags");
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setFlags(data.flags);
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data) setAdminName(data.admin.name);
      });
    loadFlags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const res = await fetch("/api/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, name, description: description || undefined, type }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFormError(data.error ?? "Gagal membuat flag");
      return;
    }
    setKey("");
    setName("");
    setDescription("");
    setType("BOOLEAN");
    setShowForm(false);
    loadFlags();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (loading) {
    return <main className="p-10 text-slate-500">Memuat...</main>;
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">Feature Flags</h1>
          {adminName && <p className="text-sm text-slate-500">Masuk sebagai {adminName}</p>}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {showForm ? "Batal" : "+ Buat Flag Baru"}
          </button>
          <button onClick={handleLogout} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Keluar
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-8 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-800">Flag Baru</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Key (unik)</label>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="contoh: dark-mode"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nama</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Deskripsi (opsional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tipe</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={type === "BOOLEAN"} onChange={() => setType("BOOLEAN")} />
                BOOLEAN (rollout bertahap on/off)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={type === "EXPERIMENT"} onChange={() => setType("EXPERIMENT")} />
                EXPERIMENT (A/B testing dengan variant)
              </label>
            </div>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button type="submit" className="w-fit rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
            Buat Flag
          </button>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {flags.length === 0 && <p className="text-sm text-slate-500">Belum ada flag.</p>}
        {flags.map((flag) => (
          <Link
            key={flag.id}
            href={`/dashboard/flags/${flag.id}`}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 hover:border-brand-300"
          >
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
              <h3 className="mt-1 font-semibold text-slate-800">{flag.name}</h3>
              {flag.description && <p className="text-sm text-slate-500">{flag.description}</p>}
            </div>
            <div className="text-right">
              <span
                className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                  flag.enabled ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {flag.enabled ? "Aktif" : "Nonaktif"}
              </span>
              {flag.type === "BOOLEAN" && <p className="mt-1 text-xs text-slate-400">{flag.rolloutPercentage}% rollout</p>}
              {flag.type === "EXPERIMENT" && <p className="mt-1 text-xs text-slate-400">{flag.variants.length} variant</p>}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
