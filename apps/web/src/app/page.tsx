import Link from 'next/link';
import { CrownMark } from '@citizens-wear/ui/CrownMark';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-between px-6 py-12">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-3">
          <CrownMark className="h-7 w-9 text-gold" />
          <span className="cw-wordmark text-xl">
            Citizens <span className="cw-wordmark-accent">Wear</span>
          </span>
        </span>
        <nav className="text-sm text-ink-soft">
          <Link
            href="/api/connect/status"
            className="underline decoration-gold decoration-1 underline-offset-4 hover:text-ink"
          >
            Connect status
          </Link>
        </nav>
      </header>

      <section className="my-16">
        <h1 className="font-display text-5xl leading-tight md:text-6xl">
          By the Kingdom.
          <br />
          With the Kingdom.
          <br />
          <span className="text-gold">For the Kingdom.</span>
        </h1>
        <p className="mt-6 max-w-xl text-base text-ink-soft md:text-lg">
          Citizens Wear is a social platform for Christian clothing brands, citizens, and
          communities. It extends <span className="font-medium text-ink">Citizens Connect</span>,
          bringing the Kingdom to where brands and their followers meet.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <span className="inline-flex items-center rounded-md border border-border bg-paper-soft px-3 py-1 text-xs uppercase tracking-wide text-ink-soft">
            Phase 1 · Foundations
          </span>
          <span className="inline-flex items-center rounded-md bg-gold-muted px-3 py-1 text-xs uppercase tracking-wide text-gold-deep">
            Mock Connect
          </span>
        </div>
      </section>

      <footer className="border-t border-border pt-6 text-xs text-ink-soft">
        © {new Date().getFullYear()} Citizens Network · Citizens Wear is built on the Citizens
        Connect contract.
      </footer>
    </main>
  );
}
