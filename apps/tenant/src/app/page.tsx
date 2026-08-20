import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-gradient-to-br from-indigo-50 via-white to-blue-50 px-4 text-center">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold text-gray-900">Client Feedback &amp; Support Portal</h1>
        <p className="mx-auto max-w-md text-sm text-gray-500">
          Register your company to start managing support tickets and customer feedback.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/register"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
        >
          Register your company
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
