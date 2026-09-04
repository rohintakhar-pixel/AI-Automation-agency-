import Link from "next/link";

export default function NotFound() {
  return (
    <div>
      <h1 className="text-3xl font-bold">That page does not exist</h1>
      <p className="mt-4 text-ink">
        The address is wrong, or the page has been removed.
      </p>
      <ul className="mt-4 list-disc pl-6">
        <li>
          <Link href="/" className="text-link underline">
            Go to the home page
          </Link>
        </li>
        <li className="mt-1">
          <Link href="/catalog" className="text-link underline">
            Browse the catalog
          </Link>
        </li>
      </ul>
    </div>
  );
}
