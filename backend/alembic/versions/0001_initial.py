"""Initial schema — all VeloTrack tables

Revision ID: 0001_initial
Revises: 
Create Date: 2025-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('display_name', sa.String(100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )

    # ── activities ─────────────────────────────────────────────────────────────
    op.create_table(
        'activities',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('garmin_activity_id', sa.String(50), nullable=True),
        sa.Column('name', sa.String(255), nullable=False, server_default='Activity'),
        sa.Column('activity_type', sa.String(50), nullable=False, server_default='other'),
        sa.Column('sub_type', sa.String(50), nullable=True),
        sa.Column('start_time', sa.DateTime(), nullable=True),
        sa.Column('timezone', sa.String(50), nullable=True),
        sa.Column('duration_seconds', sa.Float(), nullable=True),
        sa.Column('elapsed_seconds', sa.Float(), nullable=True),
        sa.Column('moving_seconds', sa.Float(), nullable=True),
        sa.Column('distance_meters', sa.Float(), nullable=True),
        sa.Column('avg_speed_ms', sa.Float(), nullable=True),
        sa.Column('max_speed_ms', sa.Float(), nullable=True),
        sa.Column('avg_pace_per_km', sa.Float(), nullable=True),
        sa.Column('max_pace_per_km', sa.Float(), nullable=True),
        sa.Column('elevation_gain_m', sa.Float(), nullable=True),
        sa.Column('elevation_loss_m', sa.Float(), nullable=True),
        sa.Column('min_elevation_m', sa.Float(), nullable=True),
        sa.Column('max_elevation_m', sa.Float(), nullable=True),
        sa.Column('avg_hr', sa.Float(), nullable=True),
        sa.Column('max_hr', sa.Float(), nullable=True),
        sa.Column('min_hr', sa.Float(), nullable=True),
        sa.Column('calories', sa.Float(), nullable=True),
        sa.Column('active_calories', sa.Float(), nullable=True),
        sa.Column('avg_cadence', sa.Float(), nullable=True),
        sa.Column('max_cadence', sa.Float(), nullable=True),
        sa.Column('avg_power_watts', sa.Float(), nullable=True),
        sa.Column('max_power_watts', sa.Float(), nullable=True),
        sa.Column('normalized_power_watts', sa.Float(), nullable=True),
        sa.Column('avg_stride_length_m', sa.Float(), nullable=True),
        sa.Column('avg_vertical_oscillation_cm', sa.Float(), nullable=True),
        sa.Column('avg_ground_contact_ms', sa.Float(), nullable=True),
        sa.Column('avg_vertical_ratio', sa.Float(), nullable=True),
        sa.Column('avg_ground_contact_balance', sa.Float(), nullable=True),
        sa.Column('pool_length_m', sa.Float(), nullable=True),
        sa.Column('avg_swolf', sa.Float(), nullable=True),
        sa.Column('avg_stroke_rate', sa.Float(), nullable=True),
        sa.Column('stroke_type', sa.String(30), nullable=True),
        sa.Column('total_strokes', sa.Integer(), nullable=True),
        sa.Column('avg_dps', sa.Float(), nullable=True),
        sa.Column('tss', sa.Float(), nullable=True),
        sa.Column('trimp', sa.Float(), nullable=True),
        sa.Column('intensity_factor', sa.Float(), nullable=True),
        sa.Column('efficiency_factor', sa.Float(), nullable=True),
        sa.Column('aerobic_decoupling', sa.Float(), nullable=True),
        sa.Column('hrss', sa.Float(), nullable=True),
        sa.Column('training_load', sa.Float(), nullable=True),
        sa.Column('hr_zone_1_seconds', sa.Float(), nullable=True),
        sa.Column('hr_zone_2_seconds', sa.Float(), nullable=True),
        sa.Column('hr_zone_3_seconds', sa.Float(), nullable=True),
        sa.Column('hr_zone_4_seconds', sa.Float(), nullable=True),
        sa.Column('hr_zone_5_seconds', sa.Float(), nullable=True),
        sa.Column('power_zone_1_seconds', sa.Float(), nullable=True),
        sa.Column('power_zone_2_seconds', sa.Float(), nullable=True),
        sa.Column('power_zone_3_seconds', sa.Float(), nullable=True),
        sa.Column('power_zone_4_seconds', sa.Float(), nullable=True),
        sa.Column('power_zone_5_seconds', sa.Float(), nullable=True),
        sa.Column('power_zone_6_seconds', sa.Float(), nullable=True),
        sa.Column('power_zone_7_seconds', sa.Float(), nullable=True),
        sa.Column('aerobic_training_effect', sa.Float(), nullable=True),
        sa.Column('anaerobic_training_effect', sa.Float(), nullable=True),
        sa.Column('training_load_acute', sa.Float(), nullable=True),
        sa.Column('training_load_chronic', sa.Float(), nullable=True),
        sa.Column('has_gps', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('start_lat', sa.Float(), nullable=True),
        sa.Column('start_lon', sa.Float(), nullable=True),
        sa.Column('bounding_box', sa.JSON(), nullable=True),
        sa.Column('gps_track', sa.JSON(), nullable=True),
        sa.Column('hr_stream', sa.JSON(), nullable=True),
        sa.Column('pace_stream', sa.JSON(), nullable=True),
        sa.Column('power_stream', sa.JSON(), nullable=True),
        sa.Column('elevation_stream', sa.JSON(), nullable=True),
        sa.Column('cadence_stream', sa.JSON(), nullable=True),
        sa.Column('laps', sa.JSON(), nullable=True),
        sa.Column('best_efforts', sa.JSON(), nullable=True),
        sa.Column('power_curve', sa.JSON(), nullable=True),
        sa.Column('source', sa.String(20), nullable=False, server_default='garmin'),
        sa.Column('fit_file_path', sa.String(500), nullable=True),
        sa.Column('gpx_file_path', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('garmin_activity_id'),
    )
    op.create_index('ix_activities_user_start', 'activities', ['user_id', 'start_time'])
    op.create_index('ix_activities_garmin_id', 'activities', ['garmin_activity_id'])

    # ── health_metrics ─────────────────────────────────────────────────────────
    op.create_table(
        'health_metrics',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('steps', sa.Integer(), nullable=True),
        sa.Column('step_goal', sa.Integer(), nullable=True),
        sa.Column('distance_m', sa.Float(), nullable=True),
        sa.Column('resting_hr', sa.Float(), nullable=True),
        sa.Column('avg_hr', sa.Float(), nullable=True),
        sa.Column('max_hr', sa.Float(), nullable=True),
        sa.Column('min_hr', sa.Float(), nullable=True),
        sa.Column('hrv_status', sa.String(30), nullable=True),
        sa.Column('hrv_weekly_avg', sa.Float(), nullable=True),
        sa.Column('hrv_last_night', sa.Float(), nullable=True),
        sa.Column('hrv_5min_high', sa.Float(), nullable=True),
        sa.Column('hrv_5min_low', sa.Float(), nullable=True),
        sa.Column('body_battery_charged', sa.Float(), nullable=True),
        sa.Column('body_battery_drained', sa.Float(), nullable=True),
        sa.Column('body_battery_highest', sa.Float(), nullable=True),
        sa.Column('body_battery_lowest', sa.Float(), nullable=True),
        sa.Column('avg_stress', sa.Float(), nullable=True),
        sa.Column('max_stress', sa.Float(), nullable=True),
        sa.Column('rest_stress_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('low_stress_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('medium_stress_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('high_stress_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('sleep_duration_seconds', sa.Integer(), nullable=True),
        sa.Column('sleep_score', sa.Float(), nullable=True),
        sa.Column('deep_sleep_seconds', sa.Integer(), nullable=True),
        sa.Column('light_sleep_seconds', sa.Integer(), nullable=True),
        sa.Column('rem_sleep_seconds', sa.Integer(), nullable=True),
        sa.Column('awake_seconds', sa.Integer(), nullable=True),
        sa.Column('sleep_start', sa.DateTime(), nullable=True),
        sa.Column('sleep_end', sa.DateTime(), nullable=True),
        sa.Column('avg_spo2', sa.Float(), nullable=True),
        sa.Column('avg_breathing_rate', sa.Float(), nullable=True),
        sa.Column('total_calories', sa.Integer(), nullable=True),
        sa.Column('active_calories', sa.Integer(), nullable=True),
        sa.Column('bmr_calories', sa.Integer(), nullable=True),
        sa.Column('moderate_intensity_minutes', sa.Integer(), nullable=True),
        sa.Column('vigorous_intensity_minutes', sa.Integer(), nullable=True),
        sa.Column('weight_kg', sa.Float(), nullable=True),
        sa.Column('body_fat_pct', sa.Float(), nullable=True),
        sa.Column('muscle_mass_kg', sa.Float(), nullable=True),
        sa.Column('bone_mass_kg', sa.Float(), nullable=True),
        sa.Column('bmi', sa.Float(), nullable=True),
        sa.Column('training_readiness', sa.Float(), nullable=True),
        sa.Column('training_readiness_desc', sa.String(50), nullable=True),
        sa.Column('vo2max_running', sa.Float(), nullable=True),
        sa.Column('vo2max_cycling', sa.Float(), nullable=True),
        sa.Column('endurance_score', sa.Float(), nullable=True),
        sa.Column('hr_intraday', sa.JSON(), nullable=True),
        sa.Column('stress_intraday', sa.JSON(), nullable=True),
        sa.Column('body_battery_intraday', sa.JSON(), nullable=True),
        sa.Column('steps_intraday', sa.JSON(), nullable=True),
        sa.Column('spo2_intraday', sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_health_user_date', 'health_metrics', ['user_id', 'date'], unique=True)

    # ── athlete_stats ──────────────────────────────────────────────────────────
    op.create_table(
        'athlete_stats',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('ftp_watts', sa.Float(), nullable=True),
        sa.Column('threshold_pace_secs', sa.Float(), nullable=True),
        sa.Column('vo2max', sa.Float(), nullable=True),
        sa.Column('max_hr', sa.Integer(), nullable=True),
        sa.Column('resting_hr', sa.Integer(), nullable=True),
        sa.Column('lthr', sa.Float(), nullable=True),
        sa.Column('ctl', sa.Float(), nullable=True),
        sa.Column('atl', sa.Float(), nullable=True),
        sa.Column('tsb', sa.Float(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
    )

    # ── live_sessions ──────────────────────────────────────────────────────────
    op.create_table(
        'live_sessions',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('activity_type', sa.String(50), nullable=False, server_default='other'),
        sa.Column('started_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('ended_at', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('share_token', sa.String(64), nullable=False),
        sa.Column('track_points', sa.JSON(), nullable=True),
        sa.Column('garmin_livetrack_url', sa.String(500), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('share_token'),
    )

    # ── saved_routes ──────────────────────────────────────────────────────────
    op.create_table(
        'saved_routes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('activity_type', sa.String(50), nullable=False, server_default='cycling'),
        sa.Column('brouter_profile', sa.String(50), nullable=False, server_default='trekking'),
        sa.Column('distance_meters', sa.Float(), nullable=True),
        sa.Column('elevation_gain_m', sa.Float(), nullable=True),
        sa.Column('gpx_data', sa.Text(), nullable=True),
        sa.Column('waypoints', sa.JSON(), nullable=True),
        sa.Column('track_geojson', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('saved_routes')
    op.drop_table('live_sessions')
    op.drop_table('athlete_stats')
    op.drop_index('ix_health_user_date', 'health_metrics')
    op.drop_table('health_metrics')
    op.drop_index('ix_activities_garmin_id', 'activities')
    op.drop_index('ix_activities_user_start', 'activities')
    op.drop_table('activities')
    op.drop_table('users')
