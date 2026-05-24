# LifeBuddy Dirty ML Dataset

File: lifebuddy_dirty_1500.csv
Rows: 1500
Purpose: Practice ML data cleaning, preprocessing, feature engineering, and model training for LifeBuddy.

## Target Columns
- life_health_score: regression target, dirty values included.
- wellness_status: classification target: Good, Medium, Risky, with dirty labels included.
- recommendation_category: multi-class recommendation target.

## Dirty Data Included Intentionally
- Missing values: blank, NA, null, N/A, ?.
- Mixed date formats: YYYY-MM-DD, DD/MM/YYYY, MM-DD-YYYY, YYYY.MM.DD.
- Mixed units: 170cm, 80kg, 1500ml, 30min, 8hrs.
- Category typos: stressd, anxios, MISS, m/f, trailing spaces.
- Outliers: negative age, high age, impossible steps, invalid alcohol/stress values.
- Duplicates: is_duplicate_hint and repeated user/day records.
- Inconsistent labels: Good/good, Medium/MEDIUM, Risky/risk.

## Cleaning Practice Steps
1. Parse dates into one format.
2. Convert unit values into numbers.
3. Normalize gender, mood, medicine_status, and wellness_status.
4. Handle missing values.
5. Remove or cap outliers.
6. Detect duplicate user/day records.
7. Create BMI, alcohol_used_flag, medicine_missed_flag, unhealthy_meal_count.
8. Train classification model for wellness_status.
9. Train recommendation_category model.
