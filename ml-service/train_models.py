import re
import joblib
import numpy as np
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

df = pd.read_csv("lifebuddy_dirty_1500.csv")

missing_values = ["", "NA", "null", "N/A", "?"]
df = df.replace(missing_values, np.nan)

def extract_number(value):
    if pd.isna(value):
        return np.nan

    text = str(value).lower().strip()

    if "ml" in text:
        found = re.findall(r"-?\d+\.?\d*", text)
        return float(found[0]) / 1000 if found else np.nan

    if "k" in text and re.findall(r"\d+\.?\d*", text):
        found = re.findall(r"\d+\.?\d*", text)
        return float(found[0]) * 1000

    found = re.findall(r"-?\d+\.?\d*", text)
    return float(found[0]) if found else np.nan

numeric_columns = [
    "age", "height_cm", "weight_kg", "water_liters", "sleep_hours",
    "exercise_minutes", "stress_level", "alcohol_level",
    "oily_food_count", "soft_drink_count", "daily_steps"
]

for col in numeric_columns:
    df[col] = df[col].apply(extract_number)

df["gender"] = df["gender"].astype(str).str.strip().str.lower()
df["gender"] = df["gender"].replace({"m": "male", "f": "female", "unknown": "other", "nan": "other"})

df["medicine_status"] = df["medicine_status"].astype(str).str.strip().str.lower()
df["medicine_status"] = df["medicine_status"].replace({
    "miss": "missed",
    "yes": "taken",
    "no": "missed",
    "nan": "not required"
})

df["wellness_status"] = df["wellness_status"].astype(str).str.strip().str.lower()
df["wellness_status"] = df["wellness_status"].replace({
    "good": "Good",
    "medium": "Medium",
    "risk": "Risky",
    "risky": "Risky",
    "unknown": np.nan,
    "nan": np.nan
})

df["recommendation_category"] = df["recommendation_category"].astype(str).str.strip().str.lower()
df["recommendation_category"] = df["recommendation_category"].replace({
    "water-drink": "hydration",
    "sleeping": "sleep",
    "nan": np.nan
})

df = df.dropna(subset=["wellness_status", "recommendation_category"])

df["age"] = df["age"].clip(13, 90)
df["height_cm"] = df["height_cm"].clip(120, 220)
df["weight_kg"] = df["weight_kg"].clip(30, 180)
df["water_liters"] = df["water_liters"].clip(0, 8)
df["sleep_hours"] = df["sleep_hours"].clip(0, 14)
df["exercise_minutes"] = df["exercise_minutes"].clip(0, 180)
df["stress_level"] = df["stress_level"].clip(1, 10)
df["alcohol_level"] = df["alcohol_level"].clip(0, 10)
df["oily_food_count"] = df["oily_food_count"].clip(0, 10)
df["soft_drink_count"] = df["soft_drink_count"].clip(0, 10)
df["daily_steps"] = df["daily_steps"].clip(0, 30000)

df[numeric_columns] = df[numeric_columns].fillna(df[numeric_columns].median())

df["bmi"] = df["weight_kg"] / ((df["height_cm"] / 100) ** 2)
df["alcohol_used"] = (df["alcohol_level"] > 0).astype(int)
df["medicine_missed"] = (df["medicine_status"] == "missed").astype(int)
df["low_sleep"] = (df["sleep_hours"] < 6).astype(int)
df["low_water"] = (df["water_liters"] < 2).astype(int)
df["high_stress"] = (df["stress_level"] >= 8).astype(int)

feature_columns = [
    "age", "height_cm", "weight_kg", "water_liters", "sleep_hours",
    "exercise_minutes", "stress_level", "alcohol_level",
    "oily_food_count", "soft_drink_count", "daily_steps", "bmi",
    "alcohol_used", "medicine_missed", "low_sleep", "low_water", "high_stress"
]

X = df[feature_columns]

wellness_encoder = LabelEncoder()
recommendation_encoder = LabelEncoder()

y_wellness = wellness_encoder.fit_transform(df["wellness_status"])
y_recommendation = recommendation_encoder.fit_transform(df["recommendation_category"])

X_train, X_test, y_train, y_test = train_test_split(
    X, y_wellness, test_size=0.2, random_state=42, stratify=y_wellness
)

wellness_model = RandomForestClassifier(n_estimators=250, max_depth=12, random_state=42)
wellness_model.fit(X_train, y_train)

pred = wellness_model.predict(X_test)
print("Wellness Accuracy:", accuracy_score(y_test, pred))
print(classification_report(y_test, pred, target_names=wellness_encoder.classes_))

X_train2, X_test2, y_train2, y_test2 = train_test_split(
    X, y_recommendation, test_size=0.2, random_state=42, stratify=y_recommendation
)

recommendation_model = RandomForestClassifier(n_estimators=250, max_depth=12, random_state=42)
recommendation_model.fit(X_train2, y_train2)

pred2 = recommendation_model.predict(X_test2)
print("Recommendation Accuracy:", accuracy_score(y_test2, pred2))
print(classification_report(y_test2, pred2, target_names=recommendation_encoder.classes_))

joblib.dump(wellness_model, "wellness_model.pkl")
joblib.dump(recommendation_model, "recommendation_model.pkl")
joblib.dump(wellness_encoder, "wellness_encoder.pkl")
joblib.dump(recommendation_encoder, "recommendation_encoder.pkl")
joblib.dump(feature_columns, "feature_columns.pkl")

print("Models saved successfully.")