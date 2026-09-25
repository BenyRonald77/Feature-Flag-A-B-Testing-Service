import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-bold text-brand-700">Feature Flag & A/B Testing</h1>
      <p className="text-slate-600">
        Toggle fitur tanpa redeploy, rollout bertahap, assignment variant
        konsisten per pengguna, dan grafik konversi per variant.
      </p>
      <Link
        href="/login"
        className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700"
      >
        Masuk
      </Link>
    </main>
  );
}
