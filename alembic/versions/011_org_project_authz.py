"""Add organization/project authorization system.

Revision ID: 011
Revises: 010
Create Date: 2026-02-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PERMISSIONS = [
    ("auth.password_admin_reset", "auth", "password_admin_reset", "Admin-triggered password reset"),
    ("organizations.read", "organizations", "read", "Read organization settings"),
    ("organizations.write", "organizations", "write", "Update organization settings"),
    ("organizations.delete", "organizations", "delete", "Delete organization"),
    ("organizations.manage_members", "organizations", "manage_members", "Manage organization memberships"),
    ("organizations.manage_roles", "organizations", "manage_roles", "Manage organization roles"),
    ("organizations.manage_permissions", "organizations", "manage_permissions", "Manage permission grants"),
    ("organizations.manage_invites", "organizations", "manage_invites", "Manage organization invitations"),
    ("projects.read", "projects", "read", "Read projects"),
    ("projects.write", "projects", "write", "Create and update projects"),
    ("projects.delete", "projects", "delete", "Delete projects"),
    ("projects.manage_members", "projects", "manage_members", "Manage project members"),
    ("projects.manage_roles", "projects", "manage_roles", "Manage project roles"),
    ("datasets.read", "datasets", "read", "Read datasets"),
    ("datasets.write", "datasets", "write", "Create and update datasets"),
    ("datasets.delete", "datasets", "delete", "Delete datasets"),
    ("datasets.share", "datasets", "share", "Share datasets"),
    ("agents.read", "agents", "read", "Read agents"),
    ("agents.write", "agents", "write", "Create and update agents"),
    ("agents.delete", "agents", "delete", "Delete agents"),
    ("agents.share", "agents", "share", "Share agents"),
    ("runs.read", "runs", "read", "Read runs"),
    ("runs.execute", "runs", "execute", "Create and execute runs"),
    ("runs.cancel", "runs", "cancel", "Cancel runs"),
    ("runs.delete", "runs", "delete", "Delete runs"),
    ("runs.share", "runs", "share", "Share runs"),
    ("results.read", "results", "read", "Read results"),
    ("results.retry", "results", "retry", "Retry result generation"),
    ("results.accept_version", "results", "accept_version", "Accept result versions"),
    ("results.delete_version", "results", "delete_version", "Delete result versions"),
    ("results.grade", "results", "grade", "Create and edit grades"),
    ("comparisons.read", "comparisons", "read", "Read comparisons"),
    ("comparisons.write", "comparisons", "write", "Create comparisons"),
    ("comparisons.delete", "comparisons", "delete", "Delete comparisons"),
    ("traces.read", "traces", "read", "Read traces"),
    ("exports.read", "exports", "read", "Export data and charts"),
    ("notifications.read", "notifications", "read", "Read notifications"),
    ("notifications.manage", "notifications", "manage", "Manage notifications"),
    ("browse.read", "browse", "read", "Browse server files"),
]


ORG_USER_KEYS = {
    "organizations.read",
    "projects.read",
}

PROJECT_USER_KEYS = {
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
}


def _insert_permission_catalog(conn) -> None:
    permission_table = sa.table(
        "permissions",
        sa.column("key", sa.String),
        sa.column("resource", sa.String),
        sa.column("action", sa.String),
        sa.column("description", sa.Text),
    )
    op.bulk_insert(
        permission_table,
        [
            {
                "key": key,
                "resource": resource,
                "action": action,
                "description": description,
            }
            for key, resource, action, description in PERMISSIONS
        ],
    )


def _seed_bootstrap_roles(conn, bootstrap_org_id: int) -> tuple[int, int, int, int]:
    org_admin_id = conn.execute(
        sa.text(
            """
            INSERT INTO organization_roles (organization_id, name, slug, is_builtin)
            VALUES (:org_id, 'Organization Admin', 'org_admin', true)
            RETURNING id
            """
        ),
        {"org_id": bootstrap_org_id},
    ).scalar_one()

    org_user_id = conn.execute(
        sa.text(
            """
            INSERT INTO organization_roles (organization_id, name, slug, is_builtin)
            VALUES (:org_id, 'Organization User', 'org_user', true)
            RETURNING id
            """
        ),
        {"org_id": bootstrap_org_id},
    ).scalar_one()

    project_admin_id = conn.execute(
        sa.text(
            """
            INSERT INTO project_roles (organization_id, name, slug, is_builtin)
            VALUES (:org_id, 'Project Admin', 'project_admin', true)
            RETURNING id
            """
        ),
        {"org_id": bootstrap_org_id},
    ).scalar_one()

    project_user_id = conn.execute(
        sa.text(
            """
            INSERT INTO project_roles (organization_id, name, slug, is_builtin)
            VALUES (:org_id, 'Project User', 'project_user', true)
            RETURNING id
            """
        ),
        {"org_id": bootstrap_org_id},
    ).scalar_one()

    return org_admin_id, org_user_id, project_admin_id, project_user_id


def _seed_role_permissions(conn, org_admin_id: int, org_user_id: int, project_admin_id: int, project_user_id: int) -> None:
    # Org admin gets all permissions.
    conn.execute(
        sa.text(
            """
            INSERT INTO organization_role_permissions (role_id, permission_id, effect)
            SELECT :role_id, p.id, 'allow'
            FROM permissions p
            """
        ),
        {"role_id": org_admin_id},
    )

    for key in ORG_USER_KEYS:
        conn.execute(
            sa.text(
                """
                INSERT INTO organization_role_permissions (role_id, permission_id, effect)
                SELECT :role_id, p.id, 'allow'
                FROM permissions p
                WHERE p.key = :key
                """
            ),
            {"role_id": org_user_id, "key": key},
        )

    # Project admin gets almost all project/day-to-day permissions.
    conn.execute(
        sa.text(
            """
            INSERT INTO project_role_permissions (role_id, permission_id, effect)
            SELECT :role_id, p.id, 'allow'
            FROM permissions p
            WHERE p.resource NOT IN ('organizations', 'auth')
            """
        ),
        {"role_id": project_admin_id},
    )

    for key in PROJECT_USER_KEYS:
        conn.execute(
            sa.text(
                """
                INSERT INTO project_role_permissions (role_id, permission_id, effect)
                SELECT :role_id, p.id, 'allow'
                FROM permissions p
                WHERE p.key = :key
                """
            ),
            {"role_id": project_user_id, "key": key},
        )


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_is_active", "users", ["is_active"], unique=False)

    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=255), nullable=False, unique=True),
        sa.Column("is_personal", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_bootstrap", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_organizations_slug", "organizations", ["slug"], unique=True)
    op.create_index("ix_organizations_is_personal", "organizations", ["is_personal"], unique=False)
    op.create_index("ix_organizations_is_bootstrap", "organizations", ["is_bootstrap"], unique=False)
    op.create_index("ix_organizations_owner_user_id", "organizations", ["owner_user_id"], unique=False)

    op.create_table(
        "permissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(length=150), nullable=False, unique=True),
        sa.Column("resource", sa.String(length=80), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_permissions_key", "permissions", ["key"], unique=True)
    op.create_index("ix_permissions_resource", "permissions", ["resource"], unique=False)
    op.create_index("ix_permissions_action", "permissions", ["action"], unique=False)

    op.create_table(
        "organization_roles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "slug", name="uq_organization_roles_org_slug"),
    )
    op.create_index("ix_organization_roles_organization_id", "organization_roles", ["organization_id"], unique=False)
    op.create_index("ix_organization_roles_is_builtin", "organization_roles", ["is_builtin"], unique=False)

    op.create_table(
        "project_roles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "slug", name="uq_project_roles_org_slug"),
    )
    op.create_index("ix_project_roles_organization_id", "project_roles", ["organization_id"], unique=False)
    op.create_index("ix_project_roles_is_builtin", "project_roles", ["is_builtin"], unique=False)

    op.create_table(
        "organization_memberships",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("organization_roles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "user_id", name="uq_org_membership_org_user"),
    )
    op.create_index("ix_organization_memberships_organization_id", "organization_memberships", ["organization_id"], unique=False)
    op.create_index("ix_organization_memberships_user_id", "organization_memberships", ["user_id"], unique=False)
    op.create_index("ix_organization_memberships_role_id", "organization_memberships", ["role_id"], unique=False)
    op.create_index("ix_organization_memberships_is_active", "organization_memberships", ["is_active"], unique=False)

    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("organization_id", "name", name="uq_projects_org_name"),
    )
    op.create_index("ix_projects_organization_id", "projects", ["organization_id"], unique=False)
    op.create_index("ix_projects_is_archived", "projects", ["is_archived"], unique=False)
    op.create_index("ix_projects_created_by_user_id", "projects", ["created_by_user_id"], unique=False)

    op.create_table(
        "project_memberships",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("project_roles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_membership_project_user"),
    )
    op.create_index("ix_project_memberships_organization_id", "project_memberships", ["organization_id"], unique=False)
    op.create_index("ix_project_memberships_project_id", "project_memberships", ["project_id"], unique=False)
    op.create_index("ix_project_memberships_user_id", "project_memberships", ["user_id"], unique=False)
    op.create_index("ix_project_memberships_role_id", "project_memberships", ["role_id"], unique=False)
    op.create_index("ix_project_memberships_is_active", "project_memberships", ["is_active"], unique=False)

    op.create_table(
        "organization_role_permissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("organization_roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("permission_id", sa.Integer(), sa.ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("effect", sa.String(length=10), nullable=False, server_default="allow"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("role_id", "permission_id", name="uq_org_role_permission"),
    )
    op.create_index("ix_organization_role_permissions_role_id", "organization_role_permissions", ["role_id"], unique=False)
    op.create_index("ix_organization_role_permissions_permission_id", "organization_role_permissions", ["permission_id"], unique=False)
    op.create_index("ix_organization_role_permissions_effect", "organization_role_permissions", ["effect"], unique=False)

    op.create_table(
        "project_role_permissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("project_roles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("permission_id", sa.Integer(), sa.ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("effect", sa.String(length=10), nullable=False, server_default="allow"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("role_id", "permission_id", name="uq_project_role_permission"),
    )
    op.create_index("ix_project_role_permissions_role_id", "project_role_permissions", ["role_id"], unique=False)
    op.create_index("ix_project_role_permissions_permission_id", "project_role_permissions", ["permission_id"], unique=False)
    op.create_index("ix_project_role_permissions_effect", "project_role_permissions", ["effect"], unique=False)

    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_type", sa.String(length=20), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"], unique=False)
    op.create_index("ix_auth_sessions_session_type", "auth_sessions", ["session_type"], unique=False)
    op.create_index("ix_auth_sessions_token_hash", "auth_sessions", ["token_hash"], unique=True)
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"], unique=False)
    op.create_index("ix_auth_sessions_revoked_at", "auth_sessions", ["revoked_at"], unique=False)

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("token_hash", sa.String(length=128), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_admin_reset", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"], unique=False)
    op.create_index("ix_password_reset_tokens_created_by_user_id", "password_reset_tokens", ["created_by_user_id"], unique=False)
    op.create_index("ix_password_reset_tokens_token_hash", "password_reset_tokens", ["token_hash"], unique=True)
    op.create_index("ix_password_reset_tokens_expires_at", "password_reset_tokens", ["expires_at"], unique=False)
    op.create_index("ix_password_reset_tokens_is_admin_reset", "password_reset_tokens", ["is_admin_reset"], unique=False)

    op.create_table(
        "invitations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("invited_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("token_hash", sa.String(length=128), nullable=False, unique=True),
        sa.Column("org_role_id", sa.Integer(), sa.ForeignKey("organization_roles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("project_assignments", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_invitations_organization_id", "invitations", ["organization_id"], unique=False)
    op.create_index("ix_invitations_email", "invitations", ["email"], unique=False)
    op.create_index("ix_invitations_invited_by_user_id", "invitations", ["invited_by_user_id"], unique=False)
    op.create_index("ix_invitations_token_hash", "invitations", ["token_hash"], unique=True)
    op.create_index("ix_invitations_org_role_id", "invitations", ["org_role_id"], unique=False)
    op.create_index("ix_invitations_expires_at", "invitations", ["expires_at"], unique=False)

    op.create_table(
        "user_permission_grants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("permission_id", sa.Integer(), sa.ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("effect", sa.String(length=10), nullable=False, server_default="allow"),
        sa.Column("resource_type", sa.String(length=80), nullable=True),
        sa.Column("resource_id", sa.Integer(), nullable=True),
        sa.Column("granted_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_user_permission_grants_organization_id", "user_permission_grants", ["organization_id"], unique=False)
    op.create_index("ix_user_permission_grants_project_id", "user_permission_grants", ["project_id"], unique=False)
    op.create_index("ix_user_permission_grants_user_id", "user_permission_grants", ["user_id"], unique=False)
    op.create_index("ix_user_permission_grants_permission_id", "user_permission_grants", ["permission_id"], unique=False)
    op.create_index("ix_user_permission_grants_effect", "user_permission_grants", ["effect"], unique=False)
    op.create_index("ix_user_permission_grants_resource_type", "user_permission_grants", ["resource_type"], unique=False)
    op.create_index("ix_user_permission_grants_resource_id", "user_permission_grants", ["resource_id"], unique=False)
    op.create_index("ix_user_permission_grants_granted_by_user_id", "user_permission_grants", ["granted_by_user_id"], unique=False)

    op.create_table(
        "system_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bootstrap_owner_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_system_state_bootstrap_owner_user_id", "system_state", ["bootstrap_owner_user_id"], unique=False)

    # Add tenant columns to existing domain tables.
    op.add_column("benchmark_suites", sa.Column("organization_id", sa.Integer(), nullable=True))
    op.add_column("benchmark_suites", sa.Column("project_id", sa.Integer(), nullable=True))
    op.add_column("benchmark_suites", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.add_column(
        "benchmark_suites",
        sa.Column("visibility_scope", sa.String(length=20), nullable=True, server_default="project"),
    )

    op.add_column("agent_configs", sa.Column("organization_id", sa.Integer(), nullable=True))
    op.add_column("agent_configs", sa.Column("project_id", sa.Integer(), nullable=True))
    op.add_column("agent_configs", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.add_column(
        "agent_configs",
        sa.Column("visibility_scope", sa.String(length=20), nullable=True, server_default="project"),
    )

    op.add_column("runs", sa.Column("organization_id", sa.Integer(), nullable=True))
    op.add_column("runs", sa.Column("project_id", sa.Integer(), nullable=True))
    op.add_column("runs", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.add_column(
        "runs",
        sa.Column("visibility_scope", sa.String(length=20), nullable=True, server_default="project"),
    )

    op.add_column("results", sa.Column("organization_id", sa.Integer(), nullable=True))
    op.add_column("results", sa.Column("project_id", sa.Integer(), nullable=True))
    op.add_column("results", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.add_column(
        "results",
        sa.Column("visibility_scope", sa.String(length=20), nullable=True, server_default="project"),
    )

    op.add_column("comparisons", sa.Column("organization_id", sa.Integer(), nullable=True))
    op.add_column("comparisons", sa.Column("project_id", sa.Integer(), nullable=True))
    op.add_column("comparisons", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.add_column(
        "comparisons",
        sa.Column("visibility_scope", sa.String(length=20), nullable=True, server_default="project"),
    )

    op.add_column("trace_logs", sa.Column("organization_id", sa.Integer(), nullable=True))
    op.add_column("trace_logs", sa.Column("project_id", sa.Integer(), nullable=True))
    op.add_column("trace_logs", sa.Column("created_by_user_id", sa.Integer(), nullable=True))

    op.add_column("run_cost_previews", sa.Column("organization_id", sa.Integer(), nullable=True))
    op.add_column("run_cost_previews", sa.Column("project_id", sa.Integer(), nullable=True))
    op.add_column("run_cost_previews", sa.Column("created_by_user_id", sa.Integer(), nullable=True))
    op.add_column(
        "run_cost_previews",
        sa.Column("visibility_scope", sa.String(length=20), nullable=True, server_default="project"),
    )

    op.add_column("app_notifications", sa.Column("organization_id", sa.Integer(), nullable=True))
    op.add_column("app_notifications", sa.Column("project_id", sa.Integer(), nullable=True))
    op.add_column("app_notifications", sa.Column("user_id", sa.Integer(), nullable=True))

    # FK constraints for new columns.
    op.create_foreign_key(None, "benchmark_suites", "organizations", ["organization_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "benchmark_suites", "projects", ["project_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "benchmark_suites", "users", ["created_by_user_id"], ["id"], ondelete="SET NULL")

    op.create_foreign_key(None, "agent_configs", "organizations", ["organization_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "agent_configs", "projects", ["project_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "agent_configs", "users", ["created_by_user_id"], ["id"], ondelete="SET NULL")

    op.create_foreign_key(None, "runs", "organizations", ["organization_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "runs", "projects", ["project_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "runs", "users", ["created_by_user_id"], ["id"], ondelete="SET NULL")

    op.create_foreign_key(None, "results", "organizations", ["organization_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "results", "projects", ["project_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "results", "users", ["created_by_user_id"], ["id"], ondelete="SET NULL")

    op.create_foreign_key(None, "comparisons", "organizations", ["organization_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "comparisons", "projects", ["project_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "comparisons", "users", ["created_by_user_id"], ["id"], ondelete="SET NULL")

    op.create_foreign_key(None, "trace_logs", "organizations", ["organization_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "trace_logs", "projects", ["project_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "trace_logs", "users", ["created_by_user_id"], ["id"], ondelete="SET NULL")

    op.create_foreign_key(None, "run_cost_previews", "organizations", ["organization_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "run_cost_previews", "projects", ["project_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "run_cost_previews", "users", ["created_by_user_id"], ["id"], ondelete="SET NULL")

    op.create_foreign_key(None, "app_notifications", "organizations", ["organization_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "app_notifications", "projects", ["project_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key(None, "app_notifications", "users", ["user_id"], ["id"], ondelete="CASCADE")

    conn = op.get_bind()

    bootstrap_org_id = conn.execute(
        sa.text(
            """
            INSERT INTO organizations (name, slug, is_personal, is_bootstrap)
            VALUES ('Bootstrap Organization', 'bootstrap-organization', false, true)
            RETURNING id
            """
        )
    ).scalar_one()

    bootstrap_project_id = conn.execute(
        sa.text(
            """
            INSERT INTO projects (organization_id, name, description, is_archived)
            VALUES (:org_id, 'Default Project', 'Migrated legacy resources', false)
            RETURNING id
            """
        ),
        {"org_id": bootstrap_org_id},
    ).scalar_one()

    _insert_permission_catalog(conn)
    org_admin_id, org_user_id, project_admin_id, project_user_id = _seed_bootstrap_roles(conn, bootstrap_org_id)
    _seed_role_permissions(conn, org_admin_id, org_user_id, project_admin_id, project_user_id)

    conn.execute(
        sa.text("INSERT INTO system_state (id, bootstrap_owner_user_id) VALUES (1, NULL)")
    )

    # Backfill legacy records into bootstrap org/project.
    for table_name in (
        "benchmark_suites",
        "agent_configs",
        "runs",
        "results",
        "comparisons",
        "trace_logs",
        "run_cost_previews",
    ):
        conn.execute(
            sa.text(
                f"""
                UPDATE {table_name}
                SET organization_id = :org_id,
                    project_id = :project_id
                WHERE organization_id IS NULL OR project_id IS NULL
                """
            ),
            {"org_id": bootstrap_org_id, "project_id": bootstrap_project_id},
        )

    for table_name in (
        "benchmark_suites",
        "agent_configs",
        "runs",
        "results",
        "comparisons",
        "run_cost_previews",
    ):
        conn.execute(
            sa.text(
                f"""
                UPDATE {table_name}
                SET visibility_scope = COALESCE(visibility_scope, 'project')
                WHERE visibility_scope IS NULL
                """
            )
        )

    conn.execute(
        sa.text(
            """
            UPDATE app_notifications
            SET organization_id = :org_id,
                project_id = COALESCE(project_id, :project_id)
            WHERE organization_id IS NULL
            """
        ),
        {"org_id": bootstrap_org_id, "project_id": bootstrap_project_id},
    )

    # Enforce non-null tenant columns after backfill.
    for table_name in (
        "benchmark_suites",
        "agent_configs",
        "runs",
        "results",
        "comparisons",
        "trace_logs",
        "run_cost_previews",
    ):
        op.alter_column(table_name, "organization_id", nullable=False)
        op.alter_column(table_name, "project_id", nullable=False)

    for table_name in (
        "benchmark_suites",
        "agent_configs",
        "runs",
        "results",
        "comparisons",
        "run_cost_previews",
    ):
        op.alter_column(table_name, "visibility_scope", nullable=False)

    op.alter_column("app_notifications", "organization_id", nullable=False)

    # Add indexes for new tenant fields.
    for table_name in (
        "benchmark_suites",
        "agent_configs",
        "runs",
        "results",
        "comparisons",
        "trace_logs",
        "run_cost_previews",
        "app_notifications",
    ):
        op.create_index(f"ix_{table_name}_organization_id", table_name, ["organization_id"], unique=False)

    for table_name in (
        "benchmark_suites",
        "agent_configs",
        "runs",
        "results",
        "comparisons",
        "trace_logs",
        "run_cost_previews",
        "app_notifications",
    ):
        op.create_index(f"ix_{table_name}_project_id", table_name, ["project_id"], unique=False)

    for table_name in (
        "benchmark_suites",
        "agent_configs",
        "runs",
        "results",
        "comparisons",
        "run_cost_previews",
    ):
        op.create_index(f"ix_{table_name}_visibility_scope", table_name, ["visibility_scope"], unique=False)

    for table_name in (
        "benchmark_suites",
        "agent_configs",
        "runs",
        "results",
        "comparisons",
        "trace_logs",
        "run_cost_previews",
    ):
        op.create_index(f"ix_{table_name}_created_by_user_id", table_name, ["created_by_user_id"], unique=False)

    op.create_index("ix_app_notifications_user_id", "app_notifications", ["user_id"], unique=False)


def downgrade() -> None:
    # Drop indexes introduced on legacy tables.
    for table_name in (
        "benchmark_suites",
        "agent_configs",
        "runs",
        "results",
        "comparisons",
        "trace_logs",
        "run_cost_previews",
    ):
        op.drop_index(f"ix_{table_name}_created_by_user_id", table_name=table_name)

    for table_name in (
        "benchmark_suites",
        "agent_configs",
        "runs",
        "results",
        "comparisons",
        "run_cost_previews",
    ):
        op.drop_index(f"ix_{table_name}_visibility_scope", table_name=table_name)

    op.drop_index("ix_app_notifications_user_id", table_name="app_notifications")

    for table_name in (
        "benchmark_suites",
        "agent_configs",
        "runs",
        "results",
        "comparisons",
        "trace_logs",
        "run_cost_previews",
        "app_notifications",
    ):
        op.drop_index(f"ix_{table_name}_project_id", table_name=table_name)

    for table_name in (
        "benchmark_suites",
        "agent_configs",
        "runs",
        "results",
        "comparisons",
        "trace_logs",
        "run_cost_previews",
        "app_notifications",
    ):
        op.drop_index(f"ix_{table_name}_organization_id", table_name=table_name)

    # Drop legacy table columns and constraints.
    op.drop_column("app_notifications", "user_id")
    op.drop_column("app_notifications", "project_id")
    op.drop_column("app_notifications", "organization_id")

    op.drop_column("run_cost_previews", "visibility_scope")
    op.drop_column("run_cost_previews", "created_by_user_id")
    op.drop_column("run_cost_previews", "project_id")
    op.drop_column("run_cost_previews", "organization_id")

    op.drop_column("trace_logs", "created_by_user_id")
    op.drop_column("trace_logs", "project_id")
    op.drop_column("trace_logs", "organization_id")

    op.drop_column("comparisons", "visibility_scope")
    op.drop_column("comparisons", "created_by_user_id")
    op.drop_column("comparisons", "project_id")
    op.drop_column("comparisons", "organization_id")

    op.drop_column("results", "visibility_scope")
    op.drop_column("results", "created_by_user_id")
    op.drop_column("results", "project_id")
    op.drop_column("results", "organization_id")

    op.drop_column("runs", "visibility_scope")
    op.drop_column("runs", "created_by_user_id")
    op.drop_column("runs", "project_id")
    op.drop_column("runs", "organization_id")

    op.drop_column("agent_configs", "visibility_scope")
    op.drop_column("agent_configs", "created_by_user_id")
    op.drop_column("agent_configs", "project_id")
    op.drop_column("agent_configs", "organization_id")

    op.drop_column("benchmark_suites", "visibility_scope")
    op.drop_column("benchmark_suites", "created_by_user_id")
    op.drop_column("benchmark_suites", "project_id")
    op.drop_column("benchmark_suites", "organization_id")

    # Drop newly added tables.
    op.drop_index("ix_system_state_bootstrap_owner_user_id", table_name="system_state")
    op.drop_table("system_state")

    op.drop_index("ix_user_permission_grants_granted_by_user_id", table_name="user_permission_grants")
    op.drop_index("ix_user_permission_grants_resource_id", table_name="user_permission_grants")
    op.drop_index("ix_user_permission_grants_resource_type", table_name="user_permission_grants")
    op.drop_index("ix_user_permission_grants_effect", table_name="user_permission_grants")
    op.drop_index("ix_user_permission_grants_permission_id", table_name="user_permission_grants")
    op.drop_index("ix_user_permission_grants_user_id", table_name="user_permission_grants")
    op.drop_index("ix_user_permission_grants_project_id", table_name="user_permission_grants")
    op.drop_index("ix_user_permission_grants_organization_id", table_name="user_permission_grants")
    op.drop_table("user_permission_grants")

    op.drop_index("ix_invitations_expires_at", table_name="invitations")
    op.drop_index("ix_invitations_org_role_id", table_name="invitations")
    op.drop_index("ix_invitations_token_hash", table_name="invitations")
    op.drop_index("ix_invitations_invited_by_user_id", table_name="invitations")
    op.drop_index("ix_invitations_email", table_name="invitations")
    op.drop_index("ix_invitations_organization_id", table_name="invitations")
    op.drop_table("invitations")

    op.drop_index("ix_password_reset_tokens_is_admin_reset", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_expires_at", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_token_hash", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_created_by_user_id", table_name="password_reset_tokens")
    op.drop_index("ix_password_reset_tokens_user_id", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")

    op.drop_index("ix_auth_sessions_revoked_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_expires_at", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_token_hash", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_session_type", table_name="auth_sessions")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")

    op.drop_index("ix_project_role_permissions_effect", table_name="project_role_permissions")
    op.drop_index("ix_project_role_permissions_permission_id", table_name="project_role_permissions")
    op.drop_index("ix_project_role_permissions_role_id", table_name="project_role_permissions")
    op.drop_table("project_role_permissions")

    op.drop_index("ix_organization_role_permissions_effect", table_name="organization_role_permissions")
    op.drop_index("ix_organization_role_permissions_permission_id", table_name="organization_role_permissions")
    op.drop_index("ix_organization_role_permissions_role_id", table_name="organization_role_permissions")
    op.drop_table("organization_role_permissions")

    op.drop_index("ix_project_memberships_is_active", table_name="project_memberships")
    op.drop_index("ix_project_memberships_role_id", table_name="project_memberships")
    op.drop_index("ix_project_memberships_user_id", table_name="project_memberships")
    op.drop_index("ix_project_memberships_project_id", table_name="project_memberships")
    op.drop_index("ix_project_memberships_organization_id", table_name="project_memberships")
    op.drop_table("project_memberships")

    op.drop_index("ix_projects_created_by_user_id", table_name="projects")
    op.drop_index("ix_projects_is_archived", table_name="projects")
    op.drop_index("ix_projects_organization_id", table_name="projects")
    op.drop_table("projects")

    op.drop_index("ix_organization_memberships_is_active", table_name="organization_memberships")
    op.drop_index("ix_organization_memberships_role_id", table_name="organization_memberships")
    op.drop_index("ix_organization_memberships_user_id", table_name="organization_memberships")
    op.drop_index("ix_organization_memberships_organization_id", table_name="organization_memberships")
    op.drop_table("organization_memberships")

    op.drop_index("ix_project_roles_is_builtin", table_name="project_roles")
    op.drop_index("ix_project_roles_organization_id", table_name="project_roles")
    op.drop_table("project_roles")

    op.drop_index("ix_organization_roles_is_builtin", table_name="organization_roles")
    op.drop_index("ix_organization_roles_organization_id", table_name="organization_roles")
    op.drop_table("organization_roles")

    op.drop_index("ix_permissions_action", table_name="permissions")
    op.drop_index("ix_permissions_resource", table_name="permissions")
    op.drop_index("ix_permissions_key", table_name="permissions")
    op.drop_table("permissions")

    op.drop_index("ix_organizations_owner_user_id", table_name="organizations")
    op.drop_index("ix_organizations_is_bootstrap", table_name="organizations")
    op.drop_index("ix_organizations_is_personal", table_name="organizations")
    op.drop_index("ix_organizations_slug", table_name="organizations")
    op.drop_table("organizations")

    op.drop_index("ix_users_is_active", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
