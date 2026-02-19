from datetime import datetime
from typing import Any, Literal, Union

from pydantic import BaseModel


# --- Suite ---
class SuiteCreate(BaseModel):
    name: str
    description: str | None = None
    tags: list[str] = []
    visibility_scope: str = "project"


class SuiteUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    visibility_scope: str | None = None


class QueryOut(BaseModel):
    id: int
    suite_id: int
    ordinal: int
    tag: str | None
    query_text: str
    expected_answer: str
    comments: str | None
    metadata_: dict | None = None

    model_config = {"from_attributes": True}


class SuiteOut(BaseModel):
    id: int
    organization_id: int
    project_id: int
    created_by_user_id: int | None
    visibility_scope: str = "project"
    name: str
    description: str | None
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    query_count: int = 0

    model_config = {"from_attributes": True}


class SuiteDetailOut(SuiteOut):
    queries: list[QueryOut] = []


# --- Query ---
class QueryCreate(BaseModel):
    tag: str | None = None
    query_text: str
    expected_answer: str
    comments: str | None = None


# --- Agent ---
class AgentCreate(BaseModel):
    name: str
    executor_type: str = "openai_agents"
    model: str
    system_prompt: str | None = None
    source_code: str | None = None
    tools_config: Union[dict, list, None] = None
    model_settings: dict | None = None
    tags: list[str] = []
    visibility_scope: str = "project"


class AgentUpdate(BaseModel):
    name: str | None = None
    executor_type: str | None = None
    model: str | None = None
    system_prompt: str | None = None
    source_code: str | None = None
    tools_config: Union[dict, list, None] = None
    model_settings: dict | None = None
    tags: list[str] | None = None
    visibility_scope: str | None = None


class AgentOut(BaseModel):
    id: int
    organization_id: int
    project_id: int
    created_by_user_id: int | None
    visibility_scope: str = "project"
    name: str
    executor_type: str
    model: str
    system_prompt: str | None
    source_code: str | None
    tools_config: Union[dict, list, None]
    model_settings: dict | None
    tags: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatMessageIn(BaseModel):
    role: str
    content: str


class AgentChatRequest(BaseModel):
    messages: list[ChatMessageIn]
    conversation_id: str | None = None


class AgentChatResponse(BaseModel):
    assistant_message: str | None = None
    tool_calls: Any = None
    reasoning: Any = None
    usage: Any = None
    estimated_cost_usd: float = 0.0
    cost_breakdown: dict = {}
    missing_model_pricing: bool = False
    execution_time_seconds: float | None = None
    trace_log_id: int | None = None
    error: str | None = None


# --- Run ---
class RunCreate(BaseModel):
    suite_id: int
    agent_config_id: int
    label: str
    tags: list[str] = []
    batch_size: int = 10
    query_ids: list[int] | None = None  # None = all queries
    output_dir: str | None = None  # default ~/akd_data/<label>
    repeat: int = 1  # run N times
    visibility_scope: str = "project"


class RunCostPreviewOut(BaseModel):
    id: int
    organization_id: int
    project_id: int
    created_by_user_id: int | None
    visibility_scope: str = "project"
    suite_id: int
    suite_name: str = ""
    agent_config_id: int
    agent_name: str = ""
    model: str
    total_query_count: int
    sampled_query_ids: list[int]
    sampled_query_ordinals: list[int]
    sample_size: int
    repeat: int
    estimated_total_calls: int
    status: str = "pending"
    error_message: str | None = None
    pricing_version: str
    currency: str
    missing_model_pricing: bool
    pricing_rates: dict = {}
    usage_totals: dict
    cost_breakdown: dict
    per_query_costs: list[dict]
    sample_cost_usd: float
    estimated_total_cost_usd: float


class RunCostPreviewRecordOut(BaseModel):
    id: int
    organization_id: int
    project_id: int
    created_by_user_id: int | None
    visibility_scope: str = "project"
    suite_id: int
    suite_name: str = ""
    agent_config_id: int
    agent_name: str = ""
    label: str
    model: str
    total_query_count: int
    sampled_query_ids: list[int]
    sampled_query_ordinals: list[int]
    sample_size: int
    repeat: int
    estimated_total_calls: int
    status: str = "pending"
    error_message: str | None = None
    pricing_version: str
    currency: str
    missing_model_pricing: bool
    pricing_rates: dict = {}
    usage_totals: dict
    cost_breakdown: dict
    per_query_costs: list[dict]
    sample_cost_usd: float
    estimated_total_cost_usd: float
    approved_at: datetime | None
    consumed_at: datetime | None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime


class AppNotificationOut(BaseModel):
    id: int
    organization_id: int
    project_id: int | None
    user_id: int | None
    notif_type: str
    title: str
    message: str
    related_id: int | None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RunOut(BaseModel):
    id: int
    organization_id: int
    project_id: int
    created_by_user_id: int | None
    visibility_scope: str = "project"
    suite_id: int
    agent_config_id: int
    label: str
    status: str
    progress_current: int
    progress_total: int
    batch_size: int
    error_message: str | None
    output_dir: str | None
    run_group: str | None
    run_number: int = 1
    tags: list[str]
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class RunDetailOut(RunOut):
    suite_name: str = ""
    agent_name: str = ""


# --- Result ---
class ResultOut(BaseModel):
    id: int
    organization_id: int
    project_id: int
    created_by_user_id: int | None
    visibility_scope: str = "project"
    run_id: int
    query_id: int
    parent_result_id: int | None = None
    version_number: int = 1
    is_default_version: bool = True
    version_status: str = "active"
    trace_log_id: int | None = None
    agent_response: str | None
    tool_calls: Any = None
    reasoning: Any = None
    usage: Any = None
    execution_time_seconds: float | None
    error: str | None
    created_at: datetime
    grade: "GradeOut | None" = None
    query: QueryOut | None = None

    model_config = {"from_attributes": True}


class ResultFamilyOut(BaseModel):
    base_result_id: int
    versions: list[ResultOut] = []


class ResultListOut(BaseModel):
    results: list[ResultOut] = []
    versions_by_base_result: dict[int, list[ResultOut]] = {}


# --- Grade ---
class GradeCreate(BaseModel):
    grade: str  # correct, partial, wrong
    notes: str | None = None


class GradeOut(BaseModel):
    id: int
    result_id: int
    grade: str
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Analytics ---
class GradeCountsOut(BaseModel):
    correct: int = 0
    partial: int = 0
    wrong: int = 0
    total: int = 0
    accuracy: float = 0.0
    weighted_score: float = 0.0


class StatsOut(BaseModel):
    mean: float = 0
    median: float = 0
    std: float = 0
    min: float = 0
    max: float = 0
    n: int = 0


class RunAnalyticsOut(BaseModel):
    run_id: int
    label: str
    grade_counts: GradeCountsOut
    by_type: dict[str, GradeCountsOut] = {}
    performance: dict[str, StatsOut] = {}
    tool_usage: dict[str, int] = {}
    pricing_rates: dict = {}
    cost_summary: dict = {}
    query_costs: list[dict] = []


class CompareAnalyticsOut(BaseModel):
    runs: list[RunAnalyticsOut]
    consistency: dict[str, int] = {}
    query_grades: list[dict[str, Any]] = []


# --- Comparison ---
class ComparisonCreate(BaseModel):
    run_ids: list[int]
    name: str | None = None


class ComparisonOut(BaseModel):
    id: int
    organization_id: int
    project_id: int
    created_by_user_id: int | None = None
    visibility_scope: str = "project"
    name: str | None
    suite_id: int
    suite_name: str = ""
    run_ids: list[int] = []
    run_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Tracing ---
class TraceLogOut(BaseModel):
    id: int
    organization_id: int
    project_id: int
    created_by_user_id: int | None = None
    run_id: int | None
    query_id: int | None
    agent_config_id: int | None
    conversation_id: str | None = None
    trace_type: str
    provider: str
    endpoint: str
    model: str | None
    status: str
    request_payload: Any = None
    response_payload: Any = None
    usage: Any = None
    error: str | None
    estimated_cost_usd: float = 0.0
    cost_breakdown: dict = {}
    missing_model_pricing: bool = False
    latency_ms: int | None
    started_at: datetime
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TraceSummaryOut(BaseModel):
    count: int
    total_cost_usd: float
    missing_model_pricing_count: int = 0


class RunningJobItem(BaseModel):
    id: int
    kind: str
    status: str
    label: str
    created_at: datetime
    started_at: datetime | None = None
    run_id: int | None = None
    query_id: int | None = None
    agent_name: str | None = None
    suite_name: str | None = None


class RunningJobsOut(BaseModel):
    runs: list[RunningJobItem] = []
    cost_previews: list[RunningJobItem] = []
    single_queries: list[RunningJobItem] = []


# --- Auth / Workspace ---
class UserOut(BaseModel):
    id: int
    full_name: str
    email: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AuthSignupIn(BaseModel):
    full_name: str
    email: str
    password: str
    invitation_token: str | None = None


class AuthLoginIn(BaseModel):
    email: str
    password: str


class AuthPasswordForgotIn(BaseModel):
    email: str


class AuthPasswordResetIn(BaseModel):
    token: str
    password: str


class AuthAdminPasswordResetIn(BaseModel):
    user_id: int


class AuthSessionOut(BaseModel):
    user: UserOut
    organizations: list["OrganizationOut"] = []
    active_organization_id: int | None = None


class OrganizationCreate(BaseModel):
    name: str


class OrganizationUpdate(BaseModel):
    name: str | None = None


class OrganizationOut(BaseModel):
    id: int
    name: str
    slug: str
    is_personal: bool
    is_bootstrap: bool
    owner_user_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_archived: bool | None = None


class ProjectOut(BaseModel):
    id: int
    organization_id: int
    name: str
    description: str | None
    is_archived: bool
    created_by_user_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PermissionOut(BaseModel):
    id: int
    key: str
    resource: str
    action: str
    description: str | None

    model_config = {"from_attributes": True}


class RoleOut(BaseModel):
    id: int
    organization_id: int
    name: str
    slug: str
    is_builtin: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RolePermissionUpdate(BaseModel):
    permission_id: int
    effect: Literal["allow", "deny"] = "allow"


class RoleCreate(BaseModel):
    name: str
    slug: str


class InvitationProjectAssignment(BaseModel):
    project_id: int
    role_id: int | None = None


class InvitationCreate(BaseModel):
    email: str
    org_role_id: int | None = None
    project_assignments: list[InvitationProjectAssignment] = []


class InvitationAcceptIn(BaseModel):
    token: str
    full_name: str | None = None
    password: str | None = None


class InvitationOut(BaseModel):
    id: int
    organization_id: int
    email: str
    invited_by_user_id: int | None
    org_role_id: int | None
    project_assignments: list[dict]
    expires_at: datetime
    accepted_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime
    invite_link: str | None = None

    model_config = {"from_attributes": True}


class MembershipOut(BaseModel):
    id: int
    organization_id: int
    user_id: int
    user_full_name: str | None = None
    user_email: str | None = None
    role_id: int | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectMembershipOut(BaseModel):
    id: int
    organization_id: int
    project_id: int
    user_id: int
    user_full_name: str | None = None
    user_email: str | None = None
    role_id: int | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class MembershipCreate(BaseModel):
    user_id: int
    role_id: int | None = None


class ProjectMembershipCreate(BaseModel):
    user_id: int
    role_id: int | None = None


class UserPermissionGrantCreate(BaseModel):
    user_id: int
    permission_id: int
    effect: Literal["allow", "deny"] = "allow"
    project_id: int | None = None
    resource_type: str | None = None
    resource_id: int | None = None
    expires_at: datetime | None = None


class UserPermissionGrantOut(BaseModel):
    id: int
    organization_id: int
    project_id: int | None
    user_id: int
    permission_id: int
    effect: Literal["allow", "deny"]
    resource_type: str | None
    resource_id: int | None
    granted_by_user_id: int | None
    expires_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
