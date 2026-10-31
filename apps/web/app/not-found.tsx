import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <div className="num text-3xl text-muted">404</div>
      <p className="mt-3 text-muted">Page not found.</p>
      <Link href="/" className="btn mt-6">
        Back to markets
      </Link>
    </div>
  );
}
