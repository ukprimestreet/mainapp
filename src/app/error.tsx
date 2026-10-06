"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-3xl font-extrabold">Something went wrong</h1>
      <p className="mt-3 text-grey">Please try again. If it keeps happening, let us know.</p>
      <button onClick={reset} className="mt-8 min-h-12 rounded-full bg-yellow px-8 font-bold hover:bg-yellow-hover">Try again</button>
    </div>
  );
}
