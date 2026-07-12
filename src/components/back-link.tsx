import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function BackLink({
  href = "/",
  children = "Back to library",
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {children}
    </Link>
  );
}
