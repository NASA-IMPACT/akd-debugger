import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.query import Query
from models.result import Result
from models.run import Run
from services.analytics import compute_compare_analytics, compute_run_analytics
from services.context import get_request_context
from services.tenancy import apply_workspace_filter


async def generate_export_html(run_ids: list[int], db: AsyncSession) -> str:
    """Generate a self-contained HTML dashboard for sharing."""
    ctx = get_request_context()
    runs_data = []

    for rid in run_ids:
        run_stmt = apply_workspace_filter(select(Run).where(Run.id == rid), Run, ctx)
        run = (await db.execute(run_stmt)).scalar_one_or_none()
        if not run:
            continue

        results = (
            (
                await db.execute(
                    apply_workspace_filter(
                        select(Result)
                        .where(Result.run_id == rid)
                        .options(selectinload(Result.grade), selectinload(Result.query))
                        .order_by(Result.query_id),
                        Result,
                        ctx,
                    )
                )
            )
            .scalars()
            .all()
        )

        run_results = []
        for r in results:
            run_results.append(
                {
                    "id": str(r.query_id),
                    "query": r.query.query_text,
                    "tag": r.query.tag or "",
                    "expected_answer": r.query.expected_answer,
                    "comments": r.query.comments or "",
                    "agent_response": r.agent_response or "",
                    "tool_calls": r.tool_calls or [],
                    "usage": r.usage or {},
                    "execution_time_seconds": r.execution_time_seconds,
                    "grade": r.grade.grade if r.grade else "not_graded",
                }
            )

        runs_data.append(
            {
                "id": run.id,
                "label": run.label,
                "results": run_results,
            }
        )

    # Analytics
    if len(run_ids) == 1:
        analytics = await compute_run_analytics(run_ids[0], db)
        analytics_data = analytics.model_dump()
    else:
        analytics = await compute_compare_analytics(run_ids, db)
        analytics_data = analytics.model_dump()

    data_json = json.dumps(runs_data, ensure_ascii=False).replace(
        "</script>", "<\\/script>"
    )
    analytics_json = json.dumps(analytics_data, ensure_ascii=False).replace(
        "</script>", "<\\/script>"
    )

    return _EXPORT_TEMPLATE.replace("__RUNS_JSON__", data_json).replace(
        "__ANALYTICS_JSON__", analytics_json
    )


_EXPORT_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Benchmark Results Export</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#f8f9fa; color:#212529; line-height:1.6; }
header { background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%); color:white; padding:2rem; text-align:center; }
header h1 { font-size:1.8rem; margin-bottom:0.25rem; }
header p { opacity:0.8; font-size:0.9rem; }
.container { max-width:1400px; margin:0 auto; padding:1.5rem; }
.section { background:white; border-radius:12px; padding:1.5rem 2rem; margin-bottom:1.5rem; box-shadow:0 2px 8px rgba(0,0,0,0.07); }
.section h2 { font-size:1.2rem; margin-bottom:1rem; padding-bottom:0.5rem; border-bottom:2px solid #dee2e6; }
.stats-table { width:100%; border-collapse:collapse; font-size:0.93rem; }
.stats-table th, .stats-table td { padding:0.6rem 1rem; text-align:left; border-bottom:1px solid #eee; }
.stats-table th { background:#f8f9fa; font-weight:600; }
.grade { display:inline-block; padding:0.15rem 0.6rem; border-radius:12px; font-size:0.82rem; font-weight:600; }
.grade-correct { background:#d4edda; color:#155724; }
.grade-partial { background:#fff3cd; color:#856404; }
.grade-wrong { background:#f8d7da; color:#721c24; }
.grade-not_graded { background:#e9ecef; color:#6c757d; }
.query-card { background:white; border-radius:12px; margin-bottom:1.5rem; box-shadow:0 2px 8px rgba(0,0,0,0.07); overflow:hidden; }
.card-header { padding:1rem 1.5rem; border-bottom:2px solid #dee2e6; cursor:pointer; display:flex; justify-content:space-between; align-items:center; }
.card-header:hover { background:#f8f9fa; }
.card-body { display:none; padding:1.5rem; }
.card-body.open { display:block; }
.query-text { padding:0.75rem; background:#f8f9fa; border-radius:6px; border-left:4px solid #0066cc; margin-bottom:1rem; }
.response-box { background:#f8f9fa; border:2px solid #dee2e6; border-radius:8px; padding:1rem; margin:0.5rem 0; max-height:400px; overflow-y:auto; white-space:pre-wrap; font-size:0.93rem; }
.response-box.correct { background:#d4edda; border-color:#28a745; }
.response-box.partial { background:#fff3cd; border-color:#ffc107; }
.response-box.wrong { background:#f8d7da; border-color:#dc3545; }
.type-badge { display:inline-block; padding:0.15rem 0.6rem; border-radius:12px; font-size:0.78rem; font-weight:600; background:#e7f1ff; color:#004085; margin-left:0.5rem; }
.meta { font-size:0.85rem; color:#6c757d; margin-top:0.5rem; display:flex; gap:1rem; flex-wrap:wrap; }
.tab-bar { display:flex; gap:0.25rem; padding:0 1.5rem; background:#f1f3f5; border-bottom:2px solid #dee2e6; }
.tab-btn { padding:0.6rem 1rem; border:none; background:transparent; cursor:pointer; font-weight:600; font-size:0.88rem; color:#6c757d; border-bottom:3px solid transparent; margin-bottom:-2px; }
.tab-btn.active { color:#212529; background:white; border-bottom-color:#0066cc; }
.tab-panel { display:none; padding:1rem 1.5rem; }
.tab-panel.active { display:block; }
.embedded-badge { display:inline-block; background:#ffc107; color:#333; padding:0.2rem 0.6rem; border-radius:12px; font-size:0.75rem; font-weight:700; margin-left:0.5rem; }
</style>
</head>
<body>
<header>
    <h1>Benchmark Results <span class="embedded-badge">EXPORTED</span></h1>
    <p id="headerInfo"></p>
</header>
<div class="container">
    <div class="section" id="summarySection"></div>
    <div id="cardsContainer"></div>
</div>
<script>
const RUNS = __RUNS_JSON__;
const ANALYTICS = __ANALYTICS_JSON__;
const EMBEDDED_GRADES = true;

function escapeHtml(t) {
    if (typeof t !== 'string') return '';
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}
function gradeLabel(g) {
    const map = {correct:'Correct', partial:'Partial', wrong:'Wrong', not_graded:'N/A'};
    return '<span class="grade grade-' + g + '">' + (map[g] || g) + '</span>';
}

function init() {
    const labels = RUNS.map(r => r.label);
    document.getElementById('headerInfo').textContent = labels.join(' vs ');

    // Summary
    let h = '<h2>Summary</h2>';
    if (ANALYTICS.runs) {
        h += '<table class="stats-table"><thead><tr><th>Run</th><th>Correct</th><th>Partial</th><th>Wrong</th><th>Accuracy</th><th>Weighted</th></tr></thead><tbody>';
        ANALYTICS.runs.forEach(r => {
            const gc = r.grade_counts;
            h += '<tr><td><strong>' + escapeHtml(r.label) + '</strong></td>';
            h += '<td style="color:#28a745;font-weight:600">' + gc.correct + '</td>';
            h += '<td style="color:#f57c00;font-weight:600">' + gc.partial + '</td>';
            h += '<td style="color:#dc3545;font-weight:600">' + gc.wrong + '</td>';
            h += '<td>' + gc.accuracy.toFixed(1) + '%</td>';
            h += '<td><strong>' + gc.weighted_score.toFixed(1) + '%</strong></td></tr>';
        });
        h += '</tbody></table>';
    } else if (ANALYTICS.grade_counts) {
        const gc = ANALYTICS.grade_counts;
        h += '<div style="display:flex;gap:2rem;flex-wrap:wrap;font-size:1.1rem;margin:1rem 0;">';
        h += '<span style="color:#28a745;font-weight:700">Correct: ' + gc.correct + '</span>';
        h += '<span style="color:#f57c00;font-weight:700">Partial: ' + gc.partial + '</span>';
        h += '<span style="color:#dc3545;font-weight:700">Wrong: ' + gc.wrong + '</span>';
        h += '<span>Accuracy: ' + gc.accuracy.toFixed(1) + '%</span>';
        h += '<span>Weighted: ' + gc.weighted_score.toFixed(1) + '%</span>';
        h += '</div>';
    }
    document.getElementById('summarySection').innerHTML = h;

    // Cards
    const container = document.getElementById('cardsContainer');
    const allQueries = {};
    RUNS.forEach((run, ri) => {
        (run.results || []).forEach(r => {
            if (!allQueries[r.id]) allQueries[r.id] = { query: r, runs: {} };
            allQueries[r.id].runs[ri] = r;
        });
    });

    Object.keys(allQueries).sort((a, b) => parseInt(a) - parseInt(b)).forEach(qid => {
        const entry = allQueries[qid];
        const q = entry.query;
        let card = '<div class="query-card">';
        card += '<div class="card-header" onclick="this.nextElementSibling.classList.toggle(\'open\')">';
        card += '<span><strong>Q' + qid + '</strong>';
        if (q.tag) card += '<span class="type-badge">' + escapeHtml(q.tag) + '</span>';
        card += '</span><span>';
        RUNS.forEach((run, ri) => {
            const r = entry.runs[ri];
            if (r) card += gradeLabel(r.grade) + ' ';
        });
        card += '</span></div>';
        card += '<div class="card-body">';
        card += '<div class="query-text">' + escapeHtml(q.query) + '</div>';
        card += '<div style="margin-bottom:1rem"><strong>Expected:</strong> ' + escapeHtml(q.expected_answer) + '</div>';

        if (RUNS.length > 1) {
            card += '<div class="tab-bar">';
            RUNS.forEach((run, ri) => {
                card += '<button class="tab-btn' + (ri === 0 ? ' active' : '') + '" onclick="switchTab(this, \'' + qid + '\', ' + ri + ')">' + escapeHtml(run.label) + '</button>';
            });
            card += '</div>';
            RUNS.forEach((run, ri) => {
                const r = entry.runs[ri] || {};
                card += '<div class="tab-panel' + (ri === 0 ? ' active' : '') + '" id="tab-' + qid + '-' + ri + '">';
                card += '<div class="response-box ' + (r.grade || '') + '">' + escapeHtml(r.agent_response || 'N/A') + '</div>';
                card += '<div class="meta"><span><strong>Time:</strong> ' + (r.execution_time_seconds ? r.execution_time_seconds.toFixed(1) + 's' : 'N/A') + '</span>';
                card += '<span><strong>Tokens:</strong> ' + (r.usage && r.usage.total_tokens ? r.usage.total_tokens.toLocaleString() : 'N/A') + '</span>';
                card += '<span><strong>Tools:</strong> ' + (r.tool_calls ? r.tool_calls.length : 0) + '</span></div>';
                card += '</div>';
            });
        } else {
            const r = entry.runs[0] || {};
            card += '<div class="response-box ' + (r.grade || '') + '">' + escapeHtml(r.agent_response || 'N/A') + '</div>';
            card += '<div class="meta"><span><strong>Grade:</strong> ' + gradeLabel(r.grade || 'not_graded') + '</span>';
            card += '<span><strong>Time:</strong> ' + (r.execution_time_seconds ? r.execution_time_seconds.toFixed(1) + 's' : 'N/A') + '</span>';
            card += '<span><strong>Tokens:</strong> ' + (r.usage && r.usage.total_tokens ? r.usage.total_tokens.toLocaleString() : 'N/A') + '</span></div>';
        }

        card += '</div></div>';
        container.innerHTML += card;
    });
}

function switchTab(btn, qid, idx) {
    const bar = btn.parentElement;
    bar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const panels = bar.parentElement.querySelectorAll('.tab-panel');
    panels.forEach(p => p.classList.remove('active'));
    const target = document.getElementById('tab-' + qid + '-' + idx);
    if (target) target.classList.add('active');
}

init();
</script>
</body>
</html>"""
