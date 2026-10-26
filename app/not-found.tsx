import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg text-text p-4">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">404 - Page Not Found</h2>
        <p className="text-sm text-muted">The requested page does not exist.</p>
        <Link
          href="/"
          className="inline-block mt-3 px-4 py-2 rounded-xl bg-accent text-accent-fg text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
