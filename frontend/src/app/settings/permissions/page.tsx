import { redirect } from "next/navigation";

export default function LegacySettingsPermissionsPage() {
  redirect("/project-settings/permissions");
}
