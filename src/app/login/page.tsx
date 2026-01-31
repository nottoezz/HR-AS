import { Suspense } from "react";
import LoginClient from "./LoginClient";

// suspense fallback for login page
function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="bg-background w-full max-w-sm rounded-lg border p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto h-9 w-32 rounded bg-slate-200" />
          <div className="mx-auto mt-3 h-4 w-40 rounded bg-slate-200" />
        </div>
        <div className="space-y-4">
          <div className="h-10 w-full rounded bg-slate-200" />
          <div className="h-10 w-full rounded bg-slate-200" />
          <div className="h-10 w-full rounded bg-slate-200" />
        </div>
      </div>
    </div>
  );
}

// login page component
export default function Page() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginClient />
    </Suspense>
  );
}
