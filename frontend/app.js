// ============================================================
// WEATHERSPHERE AI
// ============================================================


// ============================================================
// CESIUM GLOBE
// ============================================================

const viewer = new Cesium.Viewer("cesiumContainer", {

    animation: false,
    timeline: false,

    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,

    terrainProvider:
        new Cesium.EllipsoidTerrainProvider()

});


// ============================================================
// VARIABLES
// ============================================================

let currentMarker = null;
let currentLabel = null;
let currentOverlay = null;

let currentLatitude = null;
let currentLongitude = null;


// ============================================================
// RENDER BACKEND
// ============================================================

// IMPORTANT:
// This is your deployed FastAPI backend.

const API_BASE_URL =
    "https://meteora-s26r.onrender.com";


// ============================================================
// SEARCH ELEMENTS
// ============================================================

const searchInput =
    document.getElementById("locationInput");

const searchButton =
    document.getElementById("searchButton");


// ============================================================
// SEARCH EVENTS
// ============================================================

if (searchButton) {

    searchButton.addEventListener(
        "click",
        searchLocation
    );

}


if (searchInput) {

    searchInput.addEventListener(
        "keydown",
        function (event) {

            if (event.key === "Enter") {

                searchLocation();

            }

        }
    );

}


// ============================================================
// SEARCH LOCATION
// ============================================================

async function searchLocation() {

    const locationName =
        searchInput.value.trim();


    if (!locationName) {

        return;

    }


    try {

        searchButton.disabled = true;
        searchButton.innerText = "⌛";


        // ----------------------------------------------------
        // LOCATION ALIASES
        // ----------------------------------------------------

        const normalizedName =
            locationName.toLowerCase();

        const aliases = {

            "cherrapunji": ["Sohra"],

            "cherrapunjee": ["Sohra"],

            "sohra": ["Cherrapunji"]

        };


        const searchQueries = [
            locationName
        ];


        if (aliases[normalizedName]) {

            searchQueries.push(
                ...aliases[normalizedName]
            );

        }


        // ----------------------------------------------------
        // GEOCODING
        // ----------------------------------------------------

        let data = null;


        for (
            const query of searchQueries
        ) {

            const url =
                "https://geocoding-api.open-meteo.com/v1/search" +
                `?name=${encodeURIComponent(query)}` +
                "&count=100" +
                "&language=en" +
                "&format=json";


            const response =
                await fetch(url);


            if (!response.ok) {

                continue;

            }


            const candidateData =
                await response.json();


            if (
                candidateData.results &&
                candidateData.results.length > 0
            ) {

                data = candidateData;

                break;

            }

        }


        // ----------------------------------------------------
        // NO LOCATION FOUND
        // ----------------------------------------------------

        if (
            !data ||
            !data.results ||
            data.results.length === 0
        ) {

            alert(
                "Location not found. Try another city."
            );

            return;

        }


        // ----------------------------------------------------
        // SELECT BEST RESULT
        // ----------------------------------------------------

        let result =
            data.results.find(
                function (place) {

                    return (
                        place.admin1 &&
                        place.admin1
                            .toLowerCase() ===
                        "maharashtra"
                    );

                }
            );


        if (!result) {

            result =
                data.results[0];

        }


        const latitude =
            result.latitude;

        const longitude =
            result.longitude;


        currentLatitude =
            latitude;

        currentLongitude =
            longitude;


        // ----------------------------------------------------
        // REMOVE OLD WEATHER OVERLAY
        // ----------------------------------------------------

        removeWeatherOverlay();


        // ----------------------------------------------------
        // SHOW WEATHER PANEL
        // ----------------------------------------------------

        const panel =
            document.getElementById(
                "weatherPanel"
            );


        if (panel) {

            panel.style.display = "block";

        }


        // ----------------------------------------------------
        // CAMERA
        // ----------------------------------------------------

        viewer.camera.flyTo({

            destination:
                Cesium.Cartesian3.fromDegrees(
                    longitude,
                    latitude,
                    180000
                ),

            orientation: {

                heading: 0,

                pitch:
                    Cesium.Math.toRadians(-65),

                roll: 0

            },

            duration: 3.5

        });


        // ----------------------------------------------------
        // REMOVE OLD MARKER
        // ----------------------------------------------------

        if (currentMarker) {

            viewer.entities.remove(
                currentMarker
            );

            currentMarker = null;

        }


        if (currentLabel) {

            viewer.entities.remove(
                currentLabel
            );

            currentLabel = null;

        }


        // ----------------------------------------------------
        // LOCATION MARKER
        // ----------------------------------------------------

        currentMarker =
            viewer.entities.add({

                position:
                    Cesium.Cartesian3.fromDegrees(
                        longitude,
                        latitude
                    ),

                point: {

                    pixelSize: 14,

                    color:
                        Cesium.Color.CYAN,

                    outlineColor:
                        Cesium.Color.WHITE,

                    outlineWidth: 3

                }

            });


        // ----------------------------------------------------
        // LOCATION LABEL
        // ----------------------------------------------------

        currentLabel =
            viewer.entities.add({

                position:
                    Cesium.Cartesian3.fromDegrees(
                        longitude,
                        latitude
                    ),

                label: {

                    text:
                        result.name +
                        (
                            result.admin1
                                ? `, ${result.admin1}`
                                : ""
                        ),

                    font:
                        "bold 16px sans-serif",

                    fillColor:
                        Cesium.Color.WHITE,

                    outlineColor:
                        Cesium.Color.BLACK,

                    outlineWidth: 4,

                    style:
                        Cesium.LabelStyle
                            .FILL_AND_OUTLINE,

                    verticalOrigin:
                        Cesium.VerticalOrigin
                            .BOTTOM,

                    pixelOffset:
                        new Cesium.Cartesian2(
                            0,
                            -20
                        )

                }

            });


        // ----------------------------------------------------
        // LOAD WEATHER
        // ----------------------------------------------------

        await loadWeather(
            latitude,
            longitude,
            result
        );


    } catch (error) {

        console.error(
            "Location search error:",
            error
        );


        alert(
            "Something went wrong while searching."
        );


    } finally {

        searchButton.disabled =
            false;

        searchButton.innerText =
            "🔍";

    }

}


// ============================================================
// LOAD WEATHER
// ============================================================

async function loadWeather(
    latitude,
    longitude,
    locationData
) {

    try {

        const response =
            await fetch(
                `${API_BASE_URL}/weather?lat=${latitude}&lon=${longitude}`
            );


        if (!response.ok) {

            let errorMessage =
                "Weather API request failed.";

            try {

                const errorData =
                    await response.json();

                if (errorData.detail) {

                    errorMessage =
                        errorData.detail;

                }

            } catch (error) {

                // Ignore JSON parsing error

            }


            throw new Error(
                errorMessage
            );

        }


        const data =
            await response.json();


        // ----------------------------------------------------
        // LOCATION INFORMATION
        // ----------------------------------------------------

        data.location_name =
            locationData.name;

        data.admin1 =
            locationData.admin1 || "";

        data.country =
            locationData.country || "";


        // ----------------------------------------------------
        // UPDATE WEATHER PANEL
        // ----------------------------------------------------

        updateWeatherPanel(data);


        // ----------------------------------------------------
        // WEATHER ANIMATION
        // ----------------------------------------------------

        createWeatherOverlay(
            data.condition
        );


        // ----------------------------------------------------
        // ML PREDICTION
        // ----------------------------------------------------

        loadMLPrediction(
            latitude,
            longitude
        );


    } catch (error) {

        console.error(
            "Weather loading error:",
            error
        );


        alert(
            error.message ||
            "Weather data is currently unavailable."
        );

    }

}


// ============================================================
// UPDATE WEATHER PANEL
// ============================================================

function updateWeatherPanel(data) {

    const panel =
        document.getElementById(
            "weatherPanel"
        );


    if (!panel) {

        return;

    }


    panel.style.display =
        "block";


    const cityName =
        data.location_name ||
        "Unknown Location";


    const stateName =
        data.admin1 ||
        "";


    const temperature =
        Math.round(
            data.temperature
        );


    const condition =
        data.condition ||
        "Unknown";


    const windSpeed =
        Math.round(
            data.wind_speed || 0
        );


    // --------------------------------------------------------
    // HOURLY FORECAST
    // --------------------------------------------------------

    let hourlyHTML = "";


    if (
        data.forecast &&
        data.forecast.length > 0
    ) {

        const hourlyData =
            data.forecast.slice(
                0,
                8
            );


        hourlyData.forEach(
            function (hour) {

                const time =
                    formatForecastTime(
                        hour.time
                    );


                const icon =
                    getWeatherIcon(
                        hour.weather_code
                    );


                const temp =
                    Math.round(
                        hour.temperature
                    );


                hourlyHTML += `

                    <div class="hour-card">

                        <div class="hour-time">
                            ${time}
                        </div>

                        <div class="hour-icon">
                            ${icon}
                        </div>

                        <div class="hour-temp">
                            ${temp}°
                        </div>

                    </div>

                `;

            }
        );

    }


    // --------------------------------------------------------
    // WEATHER PANEL CONTENT
    // --------------------------------------------------------

    panel.innerHTML = `

        <div class="weather-header">

            <div>

                <div class="weather-city">
                    ${cityName}
                </div>

                <div class="weather-state">
                    ${stateName}
                </div>

            </div>


            <div class="live-indicator">

                <span></span>

                LIVE

            </div>

        </div>


        <div class="temperature-section">

            <div class="temperature">
                ${temperature}°C
            </div>

            <div class="condition">
                ${condition}
            </div>

        </div>


        <div class="weather-details">


            <div class="weather-detail">

                <div class="detail-icon">
                    🌧️
                </div>

                <div class="detail-value">

                    ${
                        data.forecast?.[0]
                            ?.rain_probability
                        ?? 0
                    }%

                </div>

                <div class="detail-label">
                    Rain
                </div>

            </div>


            <div class="weather-detail">

                <div class="detail-icon">
                    💨
                </div>

                <div class="detail-value">
                    ${windSpeed} km/h
                </div>

                <div class="detail-label">
                    Wind
                </div>

            </div>


            <div class="weather-detail">

                <div class="detail-icon">
                    📍
                </div>

                <div class="detail-value">

                    ${Number(
                        data.latitude
                    ).toFixed(2)}°

                </div>

                <div class="detail-label">
                    Location
                </div>

            </div>


        </div>


        <div class="hourly-title">
            HOURLY FORECAST
        </div>


        <div class="hourly-container">

            ${hourlyHTML}

        </div>


        <div id="aiLoading">

            🤖 AI analyzing weather...

        </div>

    `;

}


// ============================================================
// FORMAT TIME
// ============================================================

function formatForecastTime(
    timeString
) {

    try {

        const date =
            new Date(timeString);


        return date.toLocaleTimeString(
            [],
            {
                hour: "numeric",
                minute: "2-digit"
            }
        );


    } catch (error) {

        return timeString;

    }

}


// ============================================================
// WEATHER ICON
// ============================================================

function getWeatherIcon(code) {

    if (code === 0) {

        return "☀️";

    }


    if (
        [1, 2].includes(code)
    ) {

        return "🌤️";

    }


    if (code === 3) {

        return "☁️";

    }


    if (
        [
            51,
            53,
            55,
            61,
            63,
            65,
            80,
            81,
            82
        ].includes(code)
    ) {

        return "🌧️";

    }


    if (
        [
            95,
            96,
            99
        ].includes(code)
    ) {

        return "⛈️";

    }


    return "🌤️";

}


// ============================================================
// WEATHER ANIMATION
// ============================================================

function createWeatherOverlay(
    condition
) {

    removeWeatherOverlay();


    const overlay =
        document.createElement(
            "div"
        );


    overlay.id =
        "weatherOverlay";


    const conditionText =
        (
            condition || ""
        ).toLowerCase();


    // --------------------------------------------------------
    // CLOUDS
    // --------------------------------------------------------

    const clouds =
        document.createElement(
            "div"
        );


    clouds.className =
        "weather-clouds";


    for (
        let i = 0;
        i < 4;
        i++
    ) {

        const cloud =
            document.createElement(
                "div"
            );


        cloud.className =
            "weather-cloud";


        clouds.appendChild(
            cloud
        );

    }


    overlay.appendChild(
        clouds
    );


    // --------------------------------------------------------
    // RAIN
    // --------------------------------------------------------

    if (
        conditionText.includes(
            "rain"
        )
    ) {

        const rainContainer =
            document.createElement(
                "div"
            );


        rainContainer.className =
            "rain-container";


        for (
            let i = 0;
            i < 70;
            i++
        ) {

            const drop =
                document.createElement(
                    "div"
                );


            drop.className =
                "rain-drop";


            drop.style.left =
                Math.random() *
                100 +
                "%";


            drop.style.animationDelay =
                Math.random() *
                2 +
                "s";


            drop.style.animationDuration =
                (
                    0.5 +
                    Math.random() *
                    0.8
                ) +
                "s";


            rainContainer.appendChild(
                drop
            );

        }


        overlay.appendChild(
            rainContainer
        );

    }


    // --------------------------------------------------------
    // LIGHTNING
    // --------------------------------------------------------

    if (
        conditionText.includes(
            "thunder"
        )
    ) {

        const lightning =
            document.createElement(
                "div"
            );


        lightning.className =
            "lightning";


        overlay.appendChild(
            lightning
        );

    }


    document.body.appendChild(
        overlay
    );


    currentOverlay =
        overlay;

}


// ============================================================
// REMOVE WEATHER OVERLAY
// ============================================================

function removeWeatherOverlay() {

    if (currentOverlay) {

        currentOverlay.remove();

        currentOverlay =
            null;

    }


    const oldOverlay =
        document.getElementById(
            "weatherOverlay"
        );


    if (oldOverlay) {

        oldOverlay.remove();

    }

}


// ============================================================
// MACHINE LEARNING PREDICTION
// ============================================================

async function loadMLPrediction(
    latitude,
    longitude
) {

    try {

        const response =
            await fetch(
                `${API_BASE_URL}/ml-prediction?lat=${latitude}&lon=${longitude}`
            );


        if (!response.ok) {

            throw new Error(
                "ML prediction request failed"
            );

        }


        const data =
            await response.json();


        console.log(
            "AI/ML prediction:",
            data
        );


        // ----------------------------------------------------
        // REMOVE LOADING MESSAGE
        // ----------------------------------------------------

        const loading =
            document.getElementById(
                "aiLoading"
            );


        if (loading) {

            loading.remove();

        }


        // ----------------------------------------------------
        // REMOVE OLD PREDICTION
        // ----------------------------------------------------

        const existingAI =
            document.getElementById(
                "aiPrediction"
            );


        if (existingAI) {

            existingAI.remove();

        }


        const panel =
            document.getElementById(
                "weatherPanel"
            );


        if (!panel) {

            return;

        }


        // ----------------------------------------------------
        // AI CARD
        // ----------------------------------------------------

        const aiPrediction =
            document.createElement(
                "div"
            );


        aiPrediction.id =
            "aiPrediction";


        const currentTemperature =
            Number(
                data.current_temperature
            );


        const predictedTemperature =
            Number(
                data.ml_predicted_temperature
            );


        const difference =
            predictedTemperature -
            currentTemperature;


        let trendText =
            "Temperature expected to remain stable.";


        if (difference > 0.3) {

            trendText =
                "Temperature is expected to rise.";

        }

        else if (
            difference < -0.3
        ) {

            trendText =
                "Temperature is expected to fall.";

        }


        aiPrediction.innerHTML = `

            <div class="ai-title">
                🤖 AI FORECAST
            </div>


            <div class="ai-temperature">
                ${predictedTemperature.toFixed(2)}°C
            </div>


            <div class="ai-description">
                Predicted temperature for the next hour
            </div>


            <div class="ai-comparison">

                Current:
                ${currentTemperature.toFixed(1)}°C

            </div>


            <div class="ai-trend">
                ${trendText}
            </div>

        `;


        panel.appendChild(
            aiPrediction
        );


    } catch (error) {

        console.error(
            "ML prediction error:",
            error
        );


        const loading =
            document.getElementById(
                "aiLoading"
            );


        if (loading) {

            loading.innerHTML =
                "🤖 AI prediction unavailable";

        }

    }

}