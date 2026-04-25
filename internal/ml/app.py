from fastapi import FastAPI
from pydantic import BaseModel
import joblib
import numpy as np
import os

app = FastAPI()

MODEL_PATH = "models/matching_model.pkl"
model = joblib.load(MODEL_PATH)

class Features(BaseModel):
    skill_match: float
    city_match: float
    availability_match: float
    salary_match: float

@app.post("/predict")
def predict(data: Features):
    x = np.array([[
        data.skill_match,
        data.city_match,
        data.availability_match,
        data.salary_match
    ]])
    score = float(model.predict_proba(x)[0][1])
    return {"score": score}

@app.get("/health")
def health():
    return {"status": "ok", "model": "XGBClassifier"}
