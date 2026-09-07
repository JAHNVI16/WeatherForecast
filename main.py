from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests
import time

from ml_model import predict_next_temperature


app = FastAPI()


# --------------------------------------------------
# CORS
# --------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# WEATHER CONDITION
# --------------------------------------------------

def get_weather_condition(code):

    if code == 0:
        return "Clear Sky ☀️"

    elif code in [1, 2, 3]:
        return "Cloudy ☁️"

    elif code in [
        51, 53, 55,
        61, 63, 65,
        80, 81, 82
    ]:
        return "Rainy 🌧️"

    elif code in [95, 96, 99]:
        return "Thunderstorm ⛈️"

    else:
        return "Unknown"


# --------------------------------------------------
# WEATHER CACHE
# --------------------------------------------------

weather_cache = {}

WEATHER_CACHE_DURATION = 600  # 10 minutes


def get_cached_weather(lat, lon):

    cache_key = (
        round(lat, 2),
        round(lon, 2)
    )

    if cache_key in weather_cache:

        saved_time, saved_data = weather_cache[cache_key]

        if time.time() - saved_time < WEATHER_CACHE_DURATION:

            print("Returning cached weather data.")

            return saved_data

    return None


def save_weather_to_cache(lat, lon, data):

    cache_key = (
        round(lat, 2),
        round(lon, 2)
    )

    weather_cache[cache_key] = (
        time.time(),
        data
    )


# --------------------------------------------------
# ML MODEL CACHE
# --------------------------------------------------

ml_cache = {}

ML_CACHE_DURATION = 3600  # 1 hour


def get_cached_ml_prediction(lat, lon):

    cache_key = (
        round(lat, 2),
        round(lon, 2)
    )

    if cache_key in ml_cache:

        saved_time, saved_prediction = ml_cache[cache_key]

        if time.time() - saved_time < ML_CACHE_DURATION:

            print("Returning cached ML prediction.")

            return saved_prediction

    return None


def save_ml_prediction_to_cache(lat, lon, prediction):

    cache_key = (
        round(lat, 2),
        round(lon, 2)
    )

    ml_cache[cache_key] = (
        time.time(),
        prediction
    )


# --------------------------------------------------
# HOME
# --------------------------------------------------

@app.get("/")
def home():

    return {
        "message": "WeatherSphere AI API is running!",
        "status": "online"
    }


# --------------------------------------------------
# WEATHER API
# --------------------------------------------------

@app.get("/weather")
def get_weather(lat: float, lon: float):

    # ----------------------------------------------
    # CHECK CACHE
    # ----------------------------------------------

    cached_data = get_cached_weather(
        lat,
        lon
    )

    if cached_data is not None:
        return cached_data


    # ----------------------------------------------
    # OPEN-METEO URL
    # ----------------------------------------------

    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}"
        f"&longitude={lon}"
        "&current="
        "temperature_2m,"
        "relative_humidity_2m,"
        "precipitation,"
        "cloud_cover,"
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


    # ----------------------------------------------
    # REQUEST
    # ----------------------------------------------

    try:

        print(
            f"Requesting weather for "
            f"{lat}, {lon}"
        )

        response = requests.get(
            url,
            timeout=20
        )


        # Open-Meteo rate limit
        if response.status_code == 429:

            print(
                "Open-Meteo returned 429 Too Many Requests."
            )

            raise HTTPException(
                status_code=503,
                detail=(
                    "Weather service is temporarily busy. "
                    "Please try again in a few minutes."
                )
            )


        response.raise_for_status()

        data = response.json()


    except requests.exceptions.Timeout:

        raise HTTPException(
            status_code=504,
            detail=(
                "Weather service timed out. "
                "Please try again."
            )
        )


    except requests.exceptions.RequestException as error:

        print(
            "Open-Meteo request error:",
            error
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "Unable to retrieve weather data "
                "right now."
            )
        )


    # ----------------------------------------------
    # CURRENT WEATHER
    # ----------------------------------------------

    current = data["current"]


    temperature = current["temperature_2m"]

    humidity = current.get(
        "relative_humidity_2m",
        0
    )

    precipitation = current.get(
        "precipitation",
        0
    )

    cloud_cover = current.get(
        "cloud_cover",
        0
    )

    wind_speed = current["wind_speed_10m"]

    weather_code = current["weather_code"]


    condition = get_weather_condition(
        weather_code
    )


    # ----------------------------------------------
    # HOURLY FORECAST
    # ----------------------------------------------

    hourly = data["hourly"]

    forecast = []


    for i in range(
        len(hourly["time"])
    ):

        forecast.append({

            "time":
                hourly["time"][i],

            "temperature":
                hourly["temperature_2m"][i],

            "rain_probability":
                hourly[
                    "precipitation_probability"
                ][i],

            "rain":
                hourly["rain"][i],

            "cloud_cover":
                hourly["cloud_cover"][i],

            "wind_speed":
                hourly["wind_speed_10m"][i],

            "weather_code":
                hourly["weather_code"][i],

            "condition":
                get_weather_condition(
                    hourly["weather_code"][i]
                )
        })


    # ----------------------------------------------
    # FINAL RESULT
    # ----------------------------------------------

    result = {

        "latitude": lat,

        "longitude": lon,

        "temperature": temperature,

        "humidity": humidity,

        "precipitation": precipitation,

        "cloud_cover": cloud_cover,

        "wind_speed": wind_speed,

        "condition": condition,

        "forecast": forecast
    }


    # ----------------------------------------------
    # SAVE TO CACHE
    # ----------------------------------------------

    save_weather_to_cache(
        lat,
        lon,
        result
    )


    return result


# --------------------------------------------------
# ML PREDICTION
# --------------------------------------------------

@app.get("/ml-prediction")
def ml_prediction(
    lat: float,
    lon: float
):

    # ----------------------------------------------
    # CHECK ML CACHE
    # ----------------------------------------------

    cached_prediction = get_cached_ml_prediction(
        lat,
        lon
    )

    if cached_prediction is not None:

        return {

            "location": {
                "latitude": lat,
                "longitude": lon
            },

            "current_temperature":
                cached_prediction["current_temperature"],

            "ml_predicted_temperature":
                cached_prediction[
                    "ml_predicted_temperature"
                ],

            "prediction_for":
                "next hour"
        }


    # ----------------------------------------------
    # GET CURRENT WEATHER
    # ----------------------------------------------

    weather_data = get_weather(
        lat,
        lon
    )


    temperature = weather_data[
        "temperature"
    ]

    humidity = weather_data[
        "humidity"
    ]

    cloud_cover = weather_data[
        "cloud_cover"
    ]

    wind_speed = weather_data[
        "wind_speed"
    ]

    precipitation = weather_data[
        "precipitation"
    ]


    # ----------------------------------------------
    # TRAIN + PREDICT
    # ----------------------------------------------

    try:

        predicted_temperature = (
            predict_next_temperature(
                latitude=lat,
                longitude=lon,
                temperature=temperature,
                humidity=humidity,
                cloud_cover=cloud_cover,
                wind_speed=wind_speed,
                precipitation=precipitation
            )
        )


    except requests.exceptions.HTTPError as error:

        print(
            "Historical weather API error:",
            error
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Historical weather service is "
                "temporarily busy. Please try again "
                "later."
            )
        )


    except requests.exceptions.RequestException as error:

        print(
            "ML API request error:",
            error
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to retrieve historical "
                "weather data right now."
            )
        )


    except Exception as error:

        print(
            "ML prediction error:",
            error
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "AI/ML prediction could not be "
                "generated."
            )
        )


    # ----------------------------------------------
    # SAVE ML RESULT
    # ----------------------------------------------

    ml_result = {

        "current_temperature":
            temperature,

        "ml_predicted_temperature":
            predicted_temperature
    }


    save_ml_prediction_to_cache(
        lat,
        lon,
        ml_result
    )


    # ----------------------------------------------
    # RESPONSE
    # ----------------------------------------------

    return {

        "location": {
            "latitude": lat,
            "longitude": lon
        },

        "current_temperature":
            temperature,

        "ml_predicted_temperature":
            predicted_temperature,

        "prediction_for":
            "next hour"
    }
