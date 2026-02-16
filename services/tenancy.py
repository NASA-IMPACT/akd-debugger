from sqlalchemy import or_

from services.context import WorkspaceContext


PROJECT_ONLY_RESOURCES = {
    "benchmark_suites",
    "agent_configs",
    "runs",
    "results",
    "comparisons",
    "trace_logs",
    "run_cost_previews",
}


def apply_org_filter(stmt, model, ctx: WorkspaceContext):
    if hasattr(model, "organization_id"):
        stmt = stmt.where(model.organization_id == ctx.organization_id)
    return stmt


def apply_workspace_filter(stmt, model, ctx: WorkspaceContext):
    stmt = apply_org_filter(stmt, model, ctx)
    if hasattr(model, "project_id") and ctx.project_id is not None:
        if hasattr(model, "visibility_scope"):
            stmt = stmt.where(
                or_(
                    model.project_id == ctx.project_id,
                    model.visibility_scope == "organization",
                )
            )
        else:
            stmt = stmt.where(model.project_id == ctx.project_id)
    return stmt


def assign_workspace_fields(obj, ctx: WorkspaceContext) -> None:
    if hasattr(obj, "organization_id"):
        obj.organization_id = ctx.organization_id
    if hasattr(obj, "project_id") and ctx.project_id is not None:
        obj.project_id = ctx.project_id
    if hasattr(obj, "created_by_user_id"):
        obj.created_by_user_id = ctx.user.id
