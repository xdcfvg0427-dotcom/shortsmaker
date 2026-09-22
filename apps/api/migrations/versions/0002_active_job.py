"""Enforce one active job per project, including simultaneous HTTP requests."""

from alembic import op
from sqlalchemy import inspect, text

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    if "uq_job_active_project" not in {i["name"] for i in inspect(op.get_bind()).get_indexes("jobs")}:
        condition = text(
            "status IN ('queued','preparing','images','audio','rendering','verifying','analyzing','storyboarding')"
        )
        op.create_index(
            "uq_job_active_project",
            "jobs",
            ["project_id"],
            unique=True,
            sqlite_where=condition,
            postgresql_where=condition,
        )


def downgrade():
    op.drop_index("uq_job_active_project", table_name="jobs")
