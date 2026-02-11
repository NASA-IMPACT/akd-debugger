"""Seed script: creates astro preset (suite + agent config).

Usage: uv run python3 -m seed
"""

import asyncio
import csv
from pathlib import Path

from sqlalchemy import select

from database import async_session
from models.agent import AgentConfig
from models.query import Query
from models.suite import BenchmarkSuite

ASTRO_SYSTEM_PROMPT = """# Astrophysics Dataset Discovery Agent

## ROLE

You are an Astrophysics Dataset Discovery Agent for experienced astronomy/astrophysics researchers. Your job is to help users find relevant datasets in NASA astrophysics archives by understanding their science goals, resolving objects and coordinates, searching archives, and presenting candidate datasets with appropriate context and caveats.

You have access to MCP tools that query astronomical services directly. Use them to search, resolve, and retrieve information in real-time.

## PRIMARY USERS
- Science researchers, PhD students, astronomers, postdoctoral researchers
- Users range from beginner to expert level

## OBJECTIVE
- Understand the user's data discovery intent through conversation
- Clarify ambiguities before searching
- Search relevant archives using your MCP tools
- Present candidate datasets with provenance, caveats, and context
- Iterate based on results
"""

ASTRO_TOOLS_CONFIG = {
    "type": "mcp",
    "server_label": "Astroquery_MCP_Server",
    "allowed_tools": [
        "astroquery_list_modules",
        "astroquery_list_functions",
        "astroquery_get_function_info",
        "astroquery_check_auth",
        "astroquery_execute",
        "ads_query_compact",
        "ads_get_paper",
    ],
    "require_approval": "never",
    "server_url": "https://distinctive-maroon-puma.fastmcp.app/mcp",
}

ASTRO_MODEL_SETTINGS = {
    "store": True,
    "reasoning": {
        "effort": "medium",
        "summary": "auto",
    },
}


async def seed():
    async with async_session() as db:
        # Check if already seeded
        existing = (
            await db.execute(
                select(BenchmarkSuite).where(BenchmarkSuite.name == "Astro Gold v1")
            )
        ).scalar_one_or_none()

        if existing:
            print("Astro Gold v1 suite already exists, skipping.")
        else:
            suite = BenchmarkSuite(
                name="Astro Gold v1",
                description="Gold standard benchmark for astrophysics dataset discovery agent",
                tags=["astro-team"],
            )
            db.add(suite)
            await db.commit()
            await db.refresh(suite)
            print(f"Created suite: {suite.name} (id={suite.id})")

            # Import queries from gold_benchmark.csv if it exists
            csv_path = Path("gold_benchmark.csv")
            if csv_path.exists():
                with open(csv_path, "r", encoding="utf-8") as f:
                    reader = csv.reader(f)
                    next(reader)  # skip header
                    count = 0
                    for row in reader:
                        if len(row) < 4:
                            continue
                        q = Query(
                            suite_id=suite.id,
                            ordinal=int(row[0])
                            if row[0].strip().isdigit()
                            else count + 1,
                            tag=row[1] if len(row) > 1 else None,
                            query_text=row[2],
                            expected_answer=row[3],
                            comments=row[4] if len(row) > 4 else None,
                        )
                        db.add(q)
                        count += 1
                    await db.commit()
                    print(f"Imported {count} queries from gold_benchmark.csv")
            else:
                print("gold_benchmark.csv not found, skipping query import")

        # Agent config
        existing_agent = (
            await db.execute(
                select(AgentConfig).where(AgentConfig.name == "GPT-5.2 CARE Agent")
            )
        ).scalar_one_or_none()

        if existing_agent:
            print("GPT-5.2 CARE Agent already exists, skipping.")
        else:
            agent = AgentConfig(
                name="GPT-5.2 CARE Agent",
                executor_type="openai_agents",
                model="gpt-5.2",
                system_prompt=ASTRO_SYSTEM_PROMPT,
                tools_config=ASTRO_TOOLS_CONFIG,
                model_settings=ASTRO_MODEL_SETTINGS,
                tags=["astro-team"],
            )
            db.add(agent)
            await db.commit()
            await db.refresh(agent)
            print(f"Created agent config: {agent.name} (id={agent.id})")

    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(seed())
