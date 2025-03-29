"use client";

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="p-6 bg-white shadow-lg rounded-lg">
        <SignIn />
      </div>
    </div>
  );
}