import pandas as pd
import numpy as np
import random

np.random.seed(42)
random.seed(42)

def generate_projects(n=300):
    data = []
    for i in range(n):
        # Base realistic fields
        land_required = round(np.random.uniform(50, 5000), 1)
        # Sometimes land acquired is very low, sometimes high
        acq_pct = np.clip(np.random.normal(60, 30), 0, 100)
        land_acquired = round(land_required * (acq_pct / 100), 1)
        
        comp_required = land_required * np.random.uniform(1000000, 15000000)
        comp_paid_pct = np.clip(np.random.normal(50, 40), 0, 100)
        comp_paid = comp_required * (comp_paid_pct / 100)
        
        env_clearance = random.choices(['NOT_REQUIRED', 'PENDING', 'COMPLETED'], weights=[0.2, 0.4, 0.4])[0]
        forest_clearance = random.choices(['NOT_REQUIRED', 'PENDING', 'COMPLETED'], weights=[0.5, 0.3, 0.2])[0]
        
        litigation_count = np.random.poisson(1.5)
        possession_issues = random.choice([0, 1])
        rnr_issues = random.choice([0, 1]) if land_required > 500 else 0
        
        # Calculate a realistic target delay (days) based on features
        base_delay = 100 # Base delay every project has
        
        delay = base_delay
        if acq_pct < 80:
            delay += (80 - acq_pct) * 5
        if comp_paid_pct < 80:
            delay += (80 - comp_paid_pct) * 4
            
        if env_clearance == 'PENDING':
            delay += random.uniform(150, 300)
        if forest_clearance == 'PENDING':
            delay += random.uniform(200, 500)
            
        delay += litigation_count * random.uniform(100, 250)
        if possession_issues:
            delay += random.uniform(50, 150)
        if rnr_issues:
            delay += random.uniform(100, 350)
            
        # Add random noise
        delay += np.random.normal(0, 50)
        delay = max(0, int(delay))
        
        data.append({
            'project_id': f'proj_{i:03d}',
            'land_required_ha': land_required,
            'land_acquired_ha': land_acquired,
            'compensation_required': comp_required,
            'compensation_paid': comp_paid,
            'environmental_clearance': env_clearance,
            'forest_clearance': forest_clearance,
            'litigation_count': litigation_count,
            'possession_issues': possession_issues,
            'rnr_issues': rnr_issues,
            'actual_delay_days': delay
        })
        
    return pd.DataFrame(data)

df = generate_projects(350)
df.to_csv('/Users/omlokhande/landguard-ai/ml-service/data/synthetic_300_projects.csv', index=False)
print("Generated synthetic_300_projects.csv with 350 highly varied rows!")
