"use client";
import { useActionState, useState } from "react";
import { importCsv } from "../../actions";
import type { ImportReport } from "@/lib/importer";

export function ImportForm() {
  const [r, action, pending] = useActionState(importCsv, null);
  const [csv, setCsv] = useState(""); // controlled: React 19 resets uncontrolled fields after an action
  const rep = r && "results" in r ? (r as ImportReport) : null;
  return (
    <div className="space-y-6">
      <form action={action} className="max-w-2xl space-y-4">
        <div><label htmlFor="file" className="mb-1 block font-bold">CSV file</label><input id="file" type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} /></div>
        <div><label htmlFor="csv" className="mb-1 block font-bold">…or paste CSV</label><textarea id="csv" name="csv" value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} className="w-full rounded-lg border-2 border-line p-2 font-mono text-xs" /></div>
        <div className="flex flex-wrap gap-3">
          <button disabled={pending} className="min-h-12 rounded-full border-2 border-ink px-6 font-bold">Dry run (no changes)</button>
          <button disabled={pending} name="apply" value="1" className="min-h-12 rounded-full bg-ink px-6 font-bold text-yellow">Import for real</button>
        </div>
      </form>
      {r && "error" in r && <p role="alert" className="font-bold text-red-700">⚠ {r.error}</p>}
      {rep && (
        <section aria-live="polite">
          <h2 className="text-xl font-extrabold">{rep.dryRun ? "Dry run result" : "Import complete"}</h2>
          <p className="mb-3">{rep.created} {rep.dryRun ? "would be created" : "created"} · {rep.duplicates} duplicates skipped · {rep.errors} errors</p>
          <table className="w-full text-left text-sm"><thead><tr className="border-b-2 border-ink"><th className="py-1">Line</th><th>Name</th><th>Result</th><th>Detail</th></tr></thead>
            <tbody>{rep.results.map((x) => <tr key={x.line} className="border-b border-line"><td className="py-1">{x.line}</td><td>{x.name}</td><td className="font-bold">{x.status === "create" ? "✓ create" : x.status === "duplicate" ? "⊘ duplicate" : "✗ error"}</td><td>{x.detail}</td></tr>)}</tbody></table>
        </section>
      )}
    </div>
  );
}
