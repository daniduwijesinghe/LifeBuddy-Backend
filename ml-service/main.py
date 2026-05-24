import joblib
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="LifeBuddy ML API")

wellness_model = joblib.load("wellness_model.pkl")
recommendation_model = joblib.load("recommendation_model.pkl")
wellness_encoder = joblib.load("wellness_encoder.pkl")
recommendation_encoder = joblib.load("recommendation_encoder.pkl")
feature_columns = joblib.load("feature_columns.pkl")

class HealthInput(BaseModel):
    age: float
    height_cm: float
    weight_kg: float
    water_liters: float
    sleep_hours: float
    exercise_minutes: float
    stress_level: float
    alcohol_level: float
    oily_food_count: float
    soft_drink_count: float
    daily_steps: float
    medicine_missed: int = 0

def build_advice(category, status, data):
    advice_map = {
        "hydration": [
            "Your water intake is low. Try to drink water regularly throughout the day.",
            "Keep a bottle near you and target at least 2 liters if suitable for you."
        ],
        "sleep": [
            "Your sleep pattern needs attention. Try sleeping earlier tonight.",
            "Reduce screen time before bed and keep a fixed sleep time."
        ],
        "exercise": [
            "Your movement level is low. Add at least 20 minutes of walking.",
            "Small daily exercise is better than doing nothing."
        ],
        "medicine": [
            "Medicine routine needs attention. Keep reminders active.",
            "If you missed important medicine, follow your doctor's instructions."
        ],
        "food": [
            "Reduce oily food and soft drinks this week.",
            "Try to add vegetables, fruits, and lighter meals."
        ],
        "alcohol_safety": [
            "You recorded alcohol. Do not drive today.",
            "Use a taxi, call a trusted person, or rest before travelling."
        ],
        "mental_wellness": [
            "Your stress level looks high. Try slow breathing for 5 minutes.",
            "Talk with someone you trust if you feel mentally tired."
        ],
        "balanced": [
            "Good progress. Keep your healthy routine steady.",
            "Continue tracking your daily habits."
        ]
    }

    result = advice_map.get(category, advice_map["balanced"])

    if status == "Risky":
        result.insert(0, "Your wellness status is risky today. Please take extra care.")

    return result

@app.get("/")
def home():
    return {"message": "LifeBuddy ML API running"}

@app.post("/predict")
def predict(data: HealthInput):
    bmi = data.weight_kg / ((data.height_cm / 100) ** 2)

    row = {
        "age": data.age,
        "height_cm": data.height_cm,
        "weight_kg": data.weight_kg,
        "water_liters": data.water_liters,
        "sleep_hours": data.sleep_hours,
        "exercise_minutes": data.exercise_minutes,
        "stress_level": data.stress_level,
        "alcohol_level": data.alcohol_level,
        "oily_food_count": data.oily_food_count,
        "soft_drink_count": data.soft_drink_count,
        "daily_steps": data.daily_steps,
        "bmi": bmi,
        "alcohol_used": 1 if data.alcohol_level > 0 else 0,
        "medicine_missed": data.medicine_missed,
        "low_sleep": 1 if data.sleep_hours < 6 else 0,
        "low_water": 1 if data.water_liters < 2 else 0,
        "high_stress": 1 if data.stress_level >= 8 else 0
    }

    input_df = pd.DataFrame([row])[feature_columns]

    wellness_pred = wellness_model.predict(input_df)[0]
    wellness_prob = wellness_model.predict_proba(input_df)[0]

    recommendation_pred = recommendation_model.predict(input_df)[0]
    recommendation_prob = recommendation_model.predict_proba(input_df)[0]

    wellness_status = wellness_encoder.inverse_transform([wellness_pred])[0]
    recommendation_category = recommendation_encoder.inverse_transform([recommendation_pred])[0]

    return {
        "wellnessStatus": wellness_status,
        "wellnessConfidence": round(float(max(wellness_prob)), 2),
        "recommendationCategory": recommendation_category,
        "recommendationConfidence": round(float(max(recommendation_prob)), 2),
        "bmi": round(float(bmi), 2),
        "advice": build_advice(recommendation_category, wellness_status, data)
    }