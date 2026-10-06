import { CSV_COLUMNS } from "@/lib/importer";
import { ImportForm } from "./ImportForm";

export default function ImportPage() {
  return (
    <>
      <h1 className="mb-2 text-3xl font-extrabold">Import businesses (CSV)</h1>
      <p className="mb-4 max-w-2xl text-grey">Always run a dry run first. Duplicates (same name + area, website host or phone) are skipped. Every row needs a <code>source</code> and original description text. See docs/data-sourcing.md and data/businesses-template.csv.</p>
      <p className="mb-6 text-sm"><strong>Columns:</strong> <code>{CSV_COLUMNS.join(", ")}</code>. <code>services</code> are separated by <code>|</code>.</p>
      <ImportForm />
    </>
  );
}
