import requests
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from datetime import datetime, timedelta


def train_weather_model(latitude, longitude):

    # Historical data needs some buffer because
    # reanalysis data is not available immediately.
    end_date = datetime.now().date() - timedelta(days=7)
    start_date = end_date - timedelta(days=30)

    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={latitude}"
        f"&longitude={longitude}"
        f"&start_date={start_date}"
        f"&end_date={end_date}"
        "&hourly="
        "temperature_2m,"
        "relative_humidity_2m,"
        "cloud_cover,"
        "wind_speed_10m,"
        "precipitation"
        "&timezone=auto"
    )

    print("Downloading historical weather data...")
    print(url)

    response = requests.get(url, timeout=30)

    print("Historical API status:", response.status_code)

    response.raise_for_status()

    data = response.json()

    df = pd.DataFrame({
        "time": data["hourly"]["time"],
        "temperature": data["hourly"]["temperature_2m"],
        "humidity": data["hourly"]["relative_humidity_2m"],
        "cloud_cover": data["hourly"]["cloud_cover"],
        "wind_speed": data["hourly"]["wind_speed_10m"],
        "precipitation": data["hourly"]["precipitation"]
    })

    df["time"] = pd.to_datetime(df["time"])

    df["hour"] = df["time"].dt.hour
    df["day"] = df["time"].dt.day
    df["month"] = df["time"].dt.month

    # Next-hour temperature is our target
    df["target_temperature"] = df["temperature"].shift(-1)

    df = df.dropna()

    features = [
        "temperature",
        "humidity",
        "cloud_cover",
        "wind_speed",
        "precipitation",
        "hour",
        "day",
        "month"
    ]

    X = df[features]
    y = df["target_temperature"]

    print("Training Random Forest model...")
    print("Training rows:", len(df))

    model = RandomForestRegressor(
        n_estimators=100,
        max_depth=10,
        random_state=42,
        n_jobs=-1
    )

    model.fit(X, y)

    print("Model training complete!")

    return model


def predict_next_temperature(
    latitude,
    longitude,
    temperature,
    humidity,
    cloud_cover,
    wind_speed,
    precipitation
):

    model = train_weather_model(
        latitude,
        longitude
    )

    now = datetime.now()

    input_data = pd.DataFrame([{
        "temperature": temperature,
        "humidity": humidity,
        "cloud_cover": cloud_cover,
        "wind_speed": wind_speed,
        "precipitation": precipitation,
        "hour": now.hour,
        "day": now.day,
        "month": now.month
    }])

    prediction = model.predict(input_data)

    predicted_temperature = round(
        float(prediction[0]),
        2
    )

    print(
        "Predicted next-hour temperature:",
        predicted_temperature
    )

    return predicted_temperature