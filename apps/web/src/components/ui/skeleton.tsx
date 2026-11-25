import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-muted rounded-none animate-pulse", className)}
      {...props}
    />
  );
}

export { Skeleton };
