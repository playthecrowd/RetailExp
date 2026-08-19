/**
 * Layout for the evaluation notices.
 *
 * Outside /experience/kameleon on purpose: proxy.ts gates that prefix, and a
 * consent document that only the already-admitted can read is not a consent
 * document. These pages must be reachable by anyone the notices bind,
 * including someone who wants to read them before entering, or after their
 * access has lapsed, or in order to make a deletion request.
 *
 * Plain and self-contained — it borrows no experience chrome, because it is
 * not part of the experience.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white text-neutral-900">
      <main className="mx-auto w-full max-w-2xl px-6 py-12">{children}</main>
    </div>
  );
}
