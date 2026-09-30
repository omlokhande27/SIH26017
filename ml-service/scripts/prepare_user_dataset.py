"""
Maps the user-supplied CAG dataset to the features that the ML service
ACTUALLY receives at prediction time (from project_feature_snapshots).
Key insight: the model must be trained on features that are non-null
in real snapshots. We train only on:
  - acquisition_percentage  (ALWAYS computed)
  - notification_delay_days (computed when dates exist)
  - affected_landowners     (integer, when available)
  - award_delay_days        (when dates exist)
  - court_cases_count       (0/1)
  - litigation_flag         (bool)
  - encroachment            (bool)
  - possession_pending      (bool)
Target: delay_days_target
"""
import pandas as pd
import numpy as np

df = pd.read_csv('/Users/omlokhande/landguard-ai/ml-service/data/user_cag_data.csv')

rows = []
for _, r in df.iterrows():
    target = r.get('target_value_days')
    if pd.isna(target) or float(target) <= 0:
        continue

    # Acquisition percentage
    land_req = r.get('land_required_ha')
    land_acq = r.get('land_in_possession_ha')
    shortfall_pct = r.get('land_shortfall_pct')

    if pd.isna(land_req):
        area_acres = r.get('area_acres')
        if not pd.isna(area_acres):
            land_req = float(area_acres) / 2.471

    if pd.isna(land_acq) and not pd.isna(land_req) and not pd.isna(shortfall_pct):
        land_acq = float(land_req) * (1 - float(shortfall_pct) / 100)

    if not pd.isna(land_req) and not pd.isna(land_acq) and float(land_req) > 0:
        acq_pct = (float(land_acq) / float(land_req)) * 100
    else:
        acq_pct = np.nan  # leave as null

    # Notification delay (SIA → PN)
    notif_delay = np.nan
    try:
        sia = r.get('sia_notification_date')
        pn = r.get('preliminary_notification_date')
        if not pd.isna(sia) and not pd.isna(pn):
            notif_delay = max(0, (pd.to_datetime(pn) - pd.to_datetime(sia)).days)
    except Exception:
        pass

    # Award delay (PN → Award)
    award_delay = np.nan
    try:
        pn = r.get('preliminary_notification_date')
        aw = r.get('award_date')
        if not pd.isna(pn) and not pd.isna(aw):
            award_delay = max(0, (pd.to_datetime(aw) - pd.to_datetime(pn)).days)
    except Exception:
        pass

    # Social scale
    gs_members = r.get('gs_total_members')
    affected = gs_members if not pd.isna(gs_members) else np.nan

    # Flags
    has_suit = not pd.isna(r.get('land_acq_compensation_suit_date'))
    gs_views = str(r.get('gs_views', '')).lower()
    dispute = any(w in gs_views for w in ['opposed', 'no consensus'])
    has_encroach = 'encroach' in str(r.get('source_note', '')).lower()
    has_possession = 'possession' in str(r.get('source_note', '')).lower() or \
                     'obstruct' in str(r.get('source_note', '')).lower()

    rows.append({
        # Core predictors (non-null in real snapshots)
        'acquisition_percentage': acq_pct,
        'notification_delay_days': notif_delay,
        'award_delay_days': award_delay,
        'affected_landowners': affected,
        # Binary flags
        'court_cases_count': 1 if has_suit else 0,
        'litigation_flag': int(has_suit or dispute),
        'encroachment': int(has_encroach),
        'possession_pending': int(has_possession),
        # Nulled out (not available in snapshots consistently)
        'land_required_ha': land_req,
        'land_acquired_ha': land_acq,
        'compensation_pending': np.nan,
        'compensation_pending_percentage': np.nan,
        'affected_families': np.nan,
        'land_dispute_flag': int(dispute),
        'title_issue_flag': 0,
        'land_record_issue_flag': 0,
        'r_and_r_required': 0,
        'r_and_r_pending': 0,
        'row_issue': 0,
        'forest_clearance_pending': 0,
        'administrative_delay': 0,
        # Target
        'delay_days_target': float(target),
    })

out_df = pd.DataFrame(rows)
print(f"Total rows: {len(out_df)}")
key_cols = ['acquisition_percentage', 'notification_delay_days', 'award_delay_days',
            'affected_landowners', 'court_cases_count', 'delay_days_target']
print(out_df[key_cols].describe())
print(f"\nRows with acq_pct non-null: {out_df['acquisition_percentage'].notna().sum()}")
print(f"Rows with notif_delay non-null: {out_df['notification_delay_days'].notna().sum()}")
print(f"Rows with award_delay non-null: {out_df['award_delay_days'].notna().sum()}")
out_df.to_csv('/Users/omlokhande/landguard-ai/ml-service/data/mapped_user_data.csv', index=False)
print("\nSaved mapped_user_data.csv")
