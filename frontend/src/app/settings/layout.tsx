"use client";

import { SettingsShell } from "@/components/settings/settings-shell";

const groups = [
  {
    title: "General",
    links: [
      { href: "/settings/account", label: "Account" },
      { href: "/settings/organization", label: "Workspace" },
      { href: "/settings/roles", label: "Roles" },
      { href: "/settings/password-reset", label: "Password Reset" },
    ],
  },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsShell groups={groups}>{children}</SettingsShell>;
}
