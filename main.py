from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import requests

from ml_model import predict_next_temperature


app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_weather_condition(code):
    if code == 0:
        return "Clear Sky ☀️"

    elif code in [1, 2, 3]:
        return "Cloudy ☁️"

    elif code in [51, 53, 55, 61, 63, 65, 80, 81, 82]:
        return "Rainy 🌧️"

    elif code in [95, 96, 99]:
        return "Thunderstorm ⛈️"

    else:
        return "Unknown"


@app.get("/")
def home():
    return {
        "message": "WeatherSphere AI API is running!"
    }


# --------------------------------------------------
# NORMAL WEATHER + FORECAST
# --------------------------------------------------

@app.get("/weather")
def get_weather(lat: float, lon: float):

    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}"
        f"&longitude={lon}"
        "&current="
        "temperature_2m,"
        "wind_speed_10m,"
        "weather_code"
        "&hourly="
        "temperature_2m,"
        "precipitation_probability,"
        "rain,"
        "cloud_cover,"
        "wind_speed_10m,"
        "weather_code"
        "&forecast_days=2"
        "&timezone=auto"
    )

    response = requests.get(url)
    response.raise_for_status()

    data = response.json()

    current = data["current"]

    temperature = current["temperature_2m"]
    wind_speed = current["wind_speed_10m"]
    weather_code = current["weather_code"]

    condition = get_weather_condition(weather_code)

    # Hourly forecast
    hourly = data["hourly"]

    forecast = []

    for i in range(len(hourly["time"])):

        forecast.append({
            "time": hourly["time"][i],
            "temperature": hourly["temperature_2m"][i],
            "rain_probability": hourly["precipitation_probability"][i],
            "rain": hourly["rain"][i],
            "cloud_cover": hourly["cloud_cover"][i],
            "wind_speed": hourly["wind_speed_10m"][i],
            "weather_code": hourly["weather_code"][i],
            "condition": get_weather_condition(
                hourly["weather_code"][i]
            )
        })

    return {
        "latitude": lat,
        "longitude": lon,
        "temperature": temperature,
        "wind_speed": wind_speed,
        "condition": condition,
        "forecast": forecast
    }


# --------------------------------------------------
# MACHINE LEARNING PREDICTION
# --------------------------------------------------

@app.get("/ml-prediction")
def ml_prediction(lat: float, lon: float):

    # Get current weather data
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}"
        f"&longitude={lon}"
        "&current="
        "temperature_2m,"
        "relative_humidity_2m,"
        "cloud_cover,"
        "wind_speed_10m,"
        "precipitation"
        "&timezone=auto"
    )

    response = requests.get(url)
    response.raise_for_status()

    data = response.json()

    current = data["current"]

    temperature = current["temperature_2m"]
    humidity = current["relative_humidity_2m"]
    cloud_cover = current["cloud_cover"]
    wind_speed = current["wind_speed_10m"]
    precipitation = current["precipitation"]

    # Ask our ML model to predict next-hour temperature
    predicted_temperature = predict_next_temperature(
        latitude=lat,
        longitude=lon,
        temperature=temperature,
        humidity=humidity,
        cloud_cover=cloud_cover,
        wind_speed=wind_speed,
        precipitation=precipitation
    )

    return {
        "location": {
            "latitude": lat,
            "longitude": lon
        },
        "current_temperature": temperature,
        "ml_predicted_temperature": predicted_temperature,
        "prediction_for": "next hour"
    }