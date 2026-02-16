"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string };

type NavGroup = {
  title: string;
  links: NavLink[];
};

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function DesktopNavGroup({ pathname, group }: { pathname: string; group: NavGroup }) {
  return (
    <div className="space-y-0.5">
      <div className="px-2.5 text-[10px] uppercase tracking-wider text-muted-light font-semibold mb-1.5">{group.title}</div>
      {group.links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "block rounded-md px-2.5 py-[7px] text-[13px] no-underline transition-colors",
            isActive(pathname, link.href)
              ? "text-foreground bg-[var(--surface-hover)] font-medium"
              : "text-muted hover:text-foreground hover:bg-[var(--surface)]"
          )}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export function SettingsShell({
  groups,
  children,
}: {
  groups: NavGroup[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const allLinks = groups.flatMap((g) => g.links);

  return (
    <div className="min-h-[72vh]">
      <div className="grid md:grid-cols-[220px_1fr]">
        <aside className="border-b md:border-b-0 md:border-r border-border px-2 py-3 md:px-3 md:py-4">
          <div className="md:hidden overflow-x-auto pb-1">
            <div className="flex gap-1 min-w-max">
              {allLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[13px] no-underline transition-colors",
                    isActive(pathname, link.href)
                      ? "bg-[var(--surface-hover)] text-foreground font-medium"
                      : "text-muted hover:text-foreground hover:bg-[var(--surface)]"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="hidden md:block space-y-3">
            {groups.map((group) => (
              <DesktopNavGroup key={group.title} pathname={pathname} group={group} />
            ))}
          </div>
        </aside>

        <section className="px-4 py-4 md:px-8 md:py-5">{children}</section>
      </div>
    </div>
  );
}
