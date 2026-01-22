"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  FolderKanban,
  Activity,
  Settings,
  ArrowLeft,
  Server
} from "lucide-react";

import { Card } from "@/components/ui/card";

function NavItem({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/admin" && pathname?.startsWith(href));

  return (
    <Link
      href={href as any}
      className={[
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      ].join(" ")}
    >
      <span className="shrink-0">{icon}</span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-full">
      {/* Mobile: horizontal nav at top */}
      <div className="md:hidden sticky top-0 z-10 bg-background border-b px-2 py-1">
        <div className="flex items-center justify-between mb-2 px-2 pt-2">
          <span className="text-xs font-semibold text-red-600">Administration</span>
          <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Dashboard
          </Link>
        </div>
        <nav className="flex items-stretch overflow-x-auto gap-1 pb-2">
          <NavItem href="/admin" label="Vue d'ensemble" icon={<LayoutDashboard className="h-4 w-4" />} />
          <NavItem href="/admin/monitoring" label="Système" icon={<Server className="h-4 w-4" />} />
          <NavItem href="/admin/users" label="Utilisateurs" icon={<Users className="h-4 w-4" />} />
          <NavItem href="/admin/teacher-requests" label="Demandes" icon={<GraduationCap className="h-4 w-4" />} />
          <NavItem href="/admin/groups" label="Groupes" icon={<FolderKanban className="h-4 w-4" />} />
          <NavItem href="/admin/activity-logs" label="Activité" icon={<Activity className="h-4 w-4" />} />
          <NavItem href="/admin/settings" label="Paramètres" icon={<Settings className="h-4 w-4" />} />
        </nav>
      </div>

      {/* Desktop: sidebar layout */}
      <div className="hidden md:grid w-full h-full grid-cols-[280px_1fr] gap-4 p-4">
        <Card className="relative overflow-hidden border bg-card text-card-foreground shadow-sm sticky top-4 h-[calc(100svh-5rem)]">
          <div className="p-5">
            <div className="mb-5">
              <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2">
                <ArrowLeft className="h-3 w-3" /> Retour au dashboard
              </Link>
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-red-600">
                  Administration
                </div>
                <div className="text-lg font-bold leading-tight">Conpagina Admin</div>
                <div className="text-xs text-muted-foreground">Gestion de la plateforme</div>
              </div>
            </div>

            <nav className="space-y-1">
              <NavItem href="/admin" label="Vue d'ensemble" icon={<LayoutDashboard className="h-4 w-4" />} />
              <NavItem href="/admin/monitoring" label="Monitoring système" icon={<Server className="h-4 w-4" />} />
              <NavItem href="/admin/users" label="Utilisateurs" icon={<Users className="h-4 w-4" />} />
              <NavItem href="/admin/teacher-requests" label="Demandes enseignant" icon={<GraduationCap className="h-4 w-4" />} />
              <NavItem href="/admin/groups" label="Groupes" icon={<FolderKanban className="h-4 w-4" />} />
              <NavItem href="/admin/activity-logs" label="Activité" icon={<Activity className="h-4 w-4" />} />
              <NavItem href="/admin/settings" label="Paramètres" icon={<Settings className="h-4 w-4" />} />
            </nav>
          </div>
        </Card>

        <main className="min-w-0">
          <div className="rounded-2xl border bg-background p-6">{children}</div>
        </main>
      </div>

      {/* Mobile: content only */}
      <div className="md:hidden p-3">
        <div className="rounded-xl border bg-background p-3">{children}</div>
      </div>
    </div>
  );
}
