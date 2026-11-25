import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield, GraduationCap, LogOut, User, Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Badge } from "./ui/badge";

export default function UserMenu() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { data: user } = useQuery({
    ...trpc.user.me.queryOptions(),
    enabled: !!session?.user,
  });

  if (isPending) {
    return <Skeleton className="h-9 w-24" />;
  }

  if (!session) {
    return (
      <Link href="/login">
        <Button variant="outline">Se connecter</Button>
      </Link>
    );
  }

  const sessionRole = (session.user as { role?: string }).role;
  const role = user?.role || sessionRole || "STUDENT";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <div className="flex items-center gap-2">
          {role === "ADMIN" && <Shield className="h-4 w-4 text-red-600" />}
          {role === "TEACHER" && <GraduationCap className="h-4 w-4 text-blue-600" />}
          {session.user.name}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{session.user.name}</p>
              <p className="text-xs leading-none text-muted-foreground">{session.user.email}</p>
              <Badge variant="secondary" className="w-fit mt-1 text-xs">
                {role === "ADMIN" ? "Administrateur" : role === "TEACHER" ? "Enseignant" : "Étudiant"}
              </Badge>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/dashboard/notifications" as any)}>
            <Bell className="h-4 w-4 mr-2" /> Alertes de lecture
          </DropdownMenuItem>
          
          {role === "ADMIN" && (
            <>
              <DropdownMenuItem onClick={() => router.push("/admin" as any)}>
                <Shield className="h-4 w-4 mr-2" />
                Administration
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    router.push("/");
                  },
                },
              });
            }}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Se déconnecter
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
