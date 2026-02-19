"use client";

import { SettingsShell } from "@/components/settings/settings-shell";

const groups = [
  {
    title: "Project",
    links: [
      { href: "/project-settings/members", label: "Members" },
      { href: "/project-settings/invitations", label: "Invitations" },
      { href: "/project-settings/roles", label: "Roles" },
      { href: "/project-settings/permissions", label: "Permissions" },
    ],
  },
];

export default function ProjectSettingsLayout({ children }: { children: React.ReactNode }) {
  return <SettingsShell groups={groups}>{children}</SettingsShell>;
}
