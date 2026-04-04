"""Add sport-specific JSON fields to activities

Revision ID: 0002_add_activity_sport_data
Revises: 0001_initial
Create Date: 2026-04-04 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = "0002_add_activity_sport_data"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("activities", sa.Column("sport_details", sa.JSON(), nullable=True))
    op.add_column("activities", sa.Column("sport_streams", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("activities", "sport_streams")
    op.drop_column("activities", "sport_details")
