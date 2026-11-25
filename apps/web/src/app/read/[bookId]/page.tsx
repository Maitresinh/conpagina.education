import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import Reader from "./reader";

export default async function ReadPage({ 
  params, searchParams
}: { 
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ annotation?: string }>;
}) {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  const { bookId } = await params;
  const { annotation } = await searchParams;
  const threadId = typeof annotation === "string" ? annotation : undefined;
  if (!session?.user) {
    const destination = `/read/${encodeURIComponent(bookId)}${threadId ? `?annotation=${encodeURIComponent(threadId)}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(destination)}`);
  }

  return <Reader bookId={bookId} initialAnnotationId={threadId} />;
}

