"use client";

import { useUser, SignOutButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { isSignedIn, user } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isSignedIn) {
      router.push("/"); // Redirect to sign-in if not authenticated
    }
  }, [isSignedIn, router]);

  if (!isSignedIn) {
    return <div className="h-screen flex items-center justify-center text-lg">Redirecting...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-6">
      <div className="bg-white shadow-lg rounded-lg p-6 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-800">Welcome, {user?.firstName}!</h1>
        <p className="text-gray-600 mt-2">Email: {user?.emailAddresses[0]?.emailAddress}</p>

        <div className="mt-6">
          <SignOutButton>
            <Button className="w-full bg-red-500 hover:bg-red-600">Sign Out</Button>
          </SignOutButton>
        </div>
      </div>
    </div>
  );
}