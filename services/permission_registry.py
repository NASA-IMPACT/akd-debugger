from dataclasses import dataclass


@dataclass(frozen=True)
class PermissionSpec:
    resource: str
    action: str
    description: str

    @property
    def key(self) -> str:
        return f"{self.resource}.{self.action}"


PERMISSION_SPECS: list[PermissionSpec] = [
    PermissionSpec("auth", "password_admin_reset", "Admin-triggered password reset"),
    PermissionSpec("organizations", "read", "Read organization settings"),
    PermissionSpec("organizations", "write", "Update organization settings"),
    PermissionSpec("organizations", "delete", "Delete organization"),
    PermissionSpec("organizations", "manage_members", "Manage organization memberships"),
    PermissionSpec("organizations", "manage_roles", "Manage organization roles"),
    PermissionSpec("organizations", "manage_permissions", "Manage permission grants"),
    PermissionSpec("organizations", "manage_invites", "Manage organization invitations"),
    PermissionSpec("projects", "read", "Read projects"),
    PermissionSpec("projects", "write", "Create and update projects"),
    PermissionSpec("projects", "delete", "Delete projects"),
    PermissionSpec("projects", "manage_members", "Manage project members"),
    PermissionSpec("projects", "manage_roles", "Manage project roles"),
    PermissionSpec("datasets", "read", "Read datasets"),
    PermissionSpec("datasets", "write", "Create and update datasets"),
    PermissionSpec("datasets", "delete", "Delete datasets"),
    PermissionSpec("datasets", "share", "Share datasets across organization or users"),
    PermissionSpec("agents", "read", "Read agents"),
    PermissionSpec("agents", "write", "Create and update agents"),
    PermissionSpec("agents", "delete", "Delete agents"),
    PermissionSpec("agents", "share", "Share agents across organization or users"),
    PermissionSpec("runs", "read", "Read runs"),
    PermissionSpec("runs", "execute", "Create and execute runs"),
    PermissionSpec("runs", "cancel", "Cancel runs"),
    PermissionSpec("runs", "delete", "Delete runs"),
    PermissionSpec("runs", "share", "Share runs across organization or users"),
    PermissionSpec("results", "read", "Read results"),
    PermissionSpec("results", "retry", "Retry result generation"),
    PermissionSpec("results", "accept_version", "Accept result versions"),
    PermissionSpec("results", "delete_version", "Delete result versions"),
    PermissionSpec("results", "grade", "Create and edit grades"),
    PermissionSpec("comparisons", "read", "Read comparisons"),
    PermissionSpec("comparisons", "write", "Create comparisons"),
    PermissionSpec("comparisons", "delete", "Delete comparisons"),
    PermissionSpec("traces", "read", "Read traces"),
    PermissionSpec("exports", "read", "Export data and charts"),
    PermissionSpec("notifications", "read", "Read notifications"),
    PermissionSpec("notifications", "manage", "Mark and delete notifications"),
    PermissionSpec("browse", "read", "Browse server-side directories"),
]


DEFAULT_ORG_ROLE_KEYS: dict[str, set[str]] = {
    "org_admin": {spec.key for spec in PERMISSION_SPECS},
    "org_user": {
        "organizations.read",
        "projects.read",
    },
}


DEFAULT_PROJECT_ROLE_KEYS: dict[str, set[str]] = {
    "project_admin": {
        "projects.read",
        "projects.manage_members",
        "projects.manage_roles",
        "datasets.read",
        "datasets.write",
        "datasets.delete",
        "datasets.share",
        "agents.read",
        "agents.write",
        "agents.delete",
        "agents.share",
        "runs.read",
        "runs.execute",
        "runs.cancel",
        "runs.delete",
        "runs.share",
        "results.read",
        "results.retry",
        "results.accept_version",
        "results.delete_version",
        "results.grade",
        "comparisons.read",
        "comparisons.write",
        "comparisons.delete",
        "traces.read",
        "exports.read",
        "notifications.read",
        "notifications.manage",
        "browse.read",
    },
    "project_user": {
        "projects.read",
        "datasets.read",
        "datasets.write",
        "agents.read",
        "agents.write",
        "runs.read",
        "runs.execute",
        "runs.cancel",
        "results.read",
        "results.retry",
        "results.accept_version",
        "results.grade",
        "comparisons.read",
        "comparisons.write",
        "traces.read",
        "exports.read",
        "notifications.read",
    },
}


RESOURCE_TO_PROJECT_REQUIRED: dict[str, bool] = {
    "organizations": False,
    "projects": False,
    "datasets": True,
    "agents": True,
    "runs": True,
    "results": True,
    "comparisons": True,
    "traces": True,
    "exports": True,
    "notifications": False,
    "browse": False,
    "auth": False,
}
