import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <div className="num text-6xl text-short">404</div>
      <p className="mt-3 text-muted">this page got stopped out.</p>
      <Link href="/" className="btn mt-6">
        back to markets
      </Link>
    </div>
  );
}
