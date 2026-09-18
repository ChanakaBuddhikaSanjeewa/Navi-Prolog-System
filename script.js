// Theme Toggle Functionality
function toggleTheme() {
    const htmlRoot = document.getElementById('html-root');
    const themeIcon = document.getElementById('theme-icon');

    if (htmlRoot.classList.contains('dark')) {
        htmlRoot.classList.remove('dark');
        themeIcon.className = "fa-solid fa-sun text-amber-400";
    } else {
        htmlRoot.classList.add('dark');
        themeIcon.className = "fa-solid fa-moon text-cyan-400";
    }
}

let map;
let startMarker = null;
let destMarker = null;
let routePolyline = null;
let navWatchId = null;
let isNavigating = false;

let startCoord = null;
let destCoord = null;

function initMap() {
    map = L.map('map', { zoomControl: false }).setView([6.9271, 79.8612], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

window.addEventListener('DOMContentLoaded', () => {
    initMap();
    renderSavedPlaces(); // Load and display saved favorite destinations
    setupAutocomplete('start-input', 'start-suggestions', (item) => {
        startCoord = { lat: parseFloat(item.lat), lon: parseFloat(item.lon), name: item.display_name };
        document.getElementById('start-input').value = item.display_name;
        updateMapMarker('start', startCoord.lat, startCoord.lon, item.display_name);
        fetchWeather(startCoord.lat, startCoord.lon);
    });
    setupAutocomplete('dest-input', 'dest-suggestions', (item) => {
        destCoord = { lat: parseFloat(item.lat), lon: parseFloat(item.lon), name: item.display_name };
        document.getElementById('dest-input').value = item.display_name;
        updateMapMarker('dest', destCoord.lat, destCoord.lon, item.display_name);
        trackFrequentDestination(item.display_name, parseFloat(item.lat), parseFloat(item.lon));
    });
});

// Automatic Saved Places / Favorites Management
function trackFrequentDestination(name, lat, lon) {
    let savedPlaces = JSON.parse(localStorage.getItem('nav_saved_places') || '[]');
    let existing = savedPlaces.find(p => p.name === name);
    if (existing) {
        existing.count += 1;
    } else {
        savedPlaces.push({ name, lat, lon, count: 1 });
    }
    savedPlaces.sort((a, b) => b.count - a.count);
    localStorage.setItem('nav_saved_places', JSON.stringify(savedPlaces));
    renderSavedPlaces();
}

function renderSavedPlaces() {
    let container = document.getElementById('saved-places-list');
    if (!container) return;
    let savedPlaces = JSON.parse(localStorage.getItem('nav_saved_places') || '[]');
    container.innerHTML = '';
    if (savedPlaces.length === 0) {
        container.innerHTML = '<div class="text-xs text-slate-500 italic p-2 text-center">No frequent places saved yet.</div>';
        return;
    }
    savedPlaces.slice(0, 4).forEach(place => {
        let div = document.createElement('div');
        div.className = 'bg-slate-100 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-2.5 rounded-xl flex items-center justify-between text-xs mb-1';
        div.innerHTML = `
            <div class="truncate pr-2">
                <div class="font-medium text-slate-800 dark:text-slate-200 truncate"><i class="fa-solid fa-star text-amber-400 mr-1"></i> ${place.name.split(',')[0]}</div>
                <div class="text-[10px] text-slate-500">Visits: ${place.count} times</div>
            </div>
            <button onclick="selectSavedPlace(${place.lat}, ${place.lon}, '${place.name.replace(/'/g, "\\'")}')" class="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded-lg text-[10px] font-medium shrink-0 cursor-pointer">Use</button>
        `;
        container.appendChild(div);
    });
}

function selectSavedPlace(lat, lon, name) {
    destCoord = { lat, lon, name };
    document.getElementById('dest-input').value = name;
    updateMapMarker('dest', lat, lon, name);
    trackFrequentDestination(name, lat, lon);
}

// Fetch Live Weather using Open-Meteo API
async function fetchWeather(lat, lon) {
    const weatherCard = document.getElementById('weather-card');
    const tempElement = document.getElementById('weather-temp');
    const conditionElement = document.getElementById('weather-condition');
    const iconContainer = document.getElementById('weather-icon-container');

    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`);
        const data = await res.json();

        if (data && data.current) {
            const temp = data.current.temperature_2m;
            const weatherCode = data.current.weather_code;
            tempElement.textContent = `${temp}°C`;

            let conditionText = "Clear Sky";
            let iconClass = "fa-solid fa-sun text-amber-400";

            if (weatherCode > 0 && weatherCode <= 3) {
                conditionText = "Partly Cloudy";
                iconClass = "fa-solid fa-cloud-sun text-cyan-400";
            } else if (weatherCode >= 51 && weatherCode <= 67) {
                conditionText = "Rain Showers";
                iconClass = "fa-solid fa-cloud-rain text-blue-400";
            } else if (weatherCode >= 95) {
                conditionText = "Thunderstorm";
                iconClass = "fa-solid fa-cloud-bolt text-purple-400";
            }

            conditionElement.textContent = conditionText;
            iconContainer.innerHTML = `<i class="${iconClass}"></i>`;
            weatherCard.classList.remove('hidden');
        }
    } catch (e) {
        console.error("Failed to fetch weather data", e);
    }
}

function setupAutocomplete(inputId, suggestionId, onSelect) {
    const input = document.getElementById(inputId);
    const box = document.getElementById(suggestionId);
    let timeout = null;

    input.addEventListener('input', () => {
        clearTimeout(timeout);
        const q = input.value.trim();
        if (q.length < 3) {
            box.classList.add('hidden');
            return;
        }
        timeout = setTimeout(async () => {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
                const data = await res.json();
                box.innerHTML = '';
                if (data && data.length > 0) {
                    data.forEach(item => {
                        const div = document.createElement('div');
                        div.className = 'px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer border-b border-slate-200 dark:border-slate-800/50 last:border-0 truncate';
                        div.textContent = item.display_name;
                        div.onclick = () => {
                            onSelect(item);
                            box.classList.add('hidden');
                        };
                        box.appendChild(div);
                    });
                    box.classList.remove('hidden');
                } else {
                    box.classList.add('hidden');
                }
            } catch (e) {
                box.classList.add('hidden');
            }
        }, 300);
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !box.contains(e.target)) {
            box.classList.add('hidden');
        }
    });
}

function updateMapMarker(type, lat, lon, label) {
    const latLng = [lat, lon];
    if (type === 'start') {
        if (startMarker) map.removeLayer(startMarker);
        startMarker = L.marker(latLng).addTo(map).bindPopup(`<b>Start:</b> ${label}`);
    } else {
        if (destMarker) map.removeLayer(destMarker);
        destMarker = L.marker(latLng).addTo(map).bindPopup(`<b>Destination:</b> ${label}`);
    }
    if (startMarker && destMarker) {
        map.fitBounds(L.featureGroup([startMarker, destMarker]).getBounds(), { padding: [50, 50] });
    } else {
        map.setView(latLng, 14);
    }
}

function useCurrentLocation() {
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        startCoord = { lat, lon, name: 'Current Location' };
        fetchWeather(lat, lon);
        try {
            const res = await fetch(`/api/reverse?lat=${lat}&lon=${lon}`);
            const data = await res.json();
            const name = data.display_name || 'Current Location';
            document.getElementById('start-input').value = name;
            startCoord.name = name;
            updateMapMarker('start', lat, lon, name);
        } catch (e) {
            document.getElementById('start-input').value = 'Current Location';
            updateMapMarker('start', lat, lon, 'Current Location');
        }
    }, () => {
        alert('Unable to retrieve your location');
    });
}

function handleTravelModeChange() {
    const travelMode = document.getElementById('travel-mode-select').value;
    console.log("Selected Travel Mode changed to:", travelMode);

    if (startCoord && destCoord) {
        calculateRoute();
    }
}

async function calculateRoute() {
    // Auto-fetch start location if typed manually without dropdown selection
    if (!startCoord && document.getElementById('start-input').value.trim() !== '') {
        const query = document.getElementById('start-input').value.trim();
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data && data.length > 0) {
                startCoord = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), name: data[0].display_name };
                updateMapMarker('start', startCoord.lat, startCoord.lon, data[0].display_name);
            }
        } catch (e) {
            console.error("Auto-fetch start location failed", e);
        }
    }

    // Auto-fetch destination if typed manually without dropdown selection
    if (!destCoord && document.getElementById('dest-input').value.trim() !== '') {
        const query = document.getElementById('dest-input').value.trim();
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (data && data.length > 0) {
                destCoord = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), name: data[0].display_name };
                updateMapMarker('dest', destCoord.lat, destCoord.lon, data[0].display_name);
            }
        } catch (e) {
            console.error("Auto-fetch destination failed", e);
        }
    }

    if (!startCoord || !destCoord) {
        alert('Please select both start location and destination.');
        return;
    }

    const preference = document.getElementById('preference-select').value;
    const travelMode = document.getElementById('travel-mode-select').value;

    try {
        const res = await fetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_coord: startCoord,
                destination_coord: destCoord,
                destination: destCoord.name,
                preference: preference,
                travel_mode: travelMode
            })
        });
        const data = await res.json();
        if (data.ok) {
            displayRouteResults(data);
            loadAlternativeCorridors();
        } else {
            alert('Could not calculate route.');
        }
    } catch (e) {
        alert('Server connection error during routing.');
    }
}

function displayRouteResults(data) {
    document.getElementById('metrics-card').classList.remove('hidden');
    document.getElementById('metric-dist').textContent = `${data.distance} km`;
    document.getElementById('metric-time').textContent = `${data.minutes} min`;
    document.getElementById('metric-stops').textContent = data.stops;

    if (routePolyline) map.removeLayer(routePolyline);

    if (data.geometry && data.geometry.length > 0) {
        const latLngs = data.geometry.map(pt => [pt.lat, pt.lon]);
        routePolyline = L.polyline(latLngs, { color: '#06b6d4', weight: 5, opacity: 0.8 }).addTo(map);
        map.fitBounds(routePolyline.getBounds(), { padding: [50, 50] });
    }
}

async function loadAlternativeCorridors() {
    const listContainer = document.getElementById('alternatives-list');
    try {
        const res = await fetch('/api/roads');
        const roads = await res.json();
        listContainer.innerHTML = '';
        roads.forEach((road) => {
            const div = document.createElement('div');
            div.className = 'bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 p-2.5 rounded-xl flex items-center justify-between text-xs';
            div.innerHTML = `
                <div>
                    <div class="font-medium text-slate-800 dark:text-slate-200">${road.name}</div>
                    <div class="text-[10px] text-slate-500 dark:text-slate-400">${road.distance} km • ~${road.duration} mins</div>
                </div>
                <button onclick="useAlternativeRoute(${road.distance}, ${road.duration})" class="bg-slate-100 dark:bg-slate-800 hover:bg-cyan-600 text-slate-700 dark:text-slate-200 hover:text-white px-2.5 py-1 rounded-lg text-[10px] font-medium transition cursor-pointer">
                    Use alternative
                </button>
            `;
            listContainer.appendChild(div);
        });
    } catch (e) {
        listContainer.innerHTML = '<div class="text-xs text-rose-400 p-2">Failed to load alternatives</div>';
    }
}

function useAlternativeRoute(dist, duration) {
    document.getElementById('metric-dist').textContent = `${dist} km`;
    document.getElementById('metric-time').textContent = `${duration} min`;
    document.getElementById('badge-recommended').textContent = 'OPENED';
    alert('Alternative route selected and applied.');
}

function toggleNavigation() {
    const btn = document.getElementById('nav-btn');
    if (!isNavigating) {
        isNavigating = true;
        btn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Navigation';
        btn.className = 'flex-1 bg-rose-600 hover:bg-rose-500 text-white font-medium py-2 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-rose-600/20';

        if (navigator.geolocation) {
            navWatchId = navigator.geolocation.watchPosition((pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                map.setView([lat, lon], 16);
            }, null, { enableHighAccuracy: true });
        }
    } else {
        stopNavigation();
    }
}

function stopNavigation() {
    isNavigating = false;
    const btn = document.getElementById('nav-btn');
    btn.innerHTML = '<i class="fa-solid fa-navigation"></i> View Journey';
    btn.className = 'flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/20';
    if (navWatchId !== null) {
        navigator.geolocation.clearWatch(navWatchId);
        navWatchId = null;
    }
}

function resetJourney() {
    stopNavigation();
    document.getElementById('metrics-card').classList.add('hidden');
    document.getElementById('weather-card').classList.add('hidden');
    document.getElementById('start-input').value = '';
    document.getElementById('dest-input').value = '';
    startCoord = null;
    destCoord = null;
    if (startMarker) map.removeLayer(startMarker);
    if (destMarker) map.removeLayer(destMarker);
    if (routePolyline) map.removeLayer(routePolyline);
    startMarker = null;
    destMarker = null;
    routePolyline = null;
    map.setView([6.9271, 79.8612], 13);
    document.getElementById('alternatives-list').innerHTML = '<div class="text-xs text-slate-500 italic p-2 bg-slate-100 dark:bg-slate-950/40 rounded-xl border border-slate-200 dark:border-slate-900 text-center">Calculate a route to view alternative options.</div>';
}

async function openRoadStatusModal() {
    document.getElementById('road-modal').classList.remove('hidden');
    const list = document.getElementById('modal-roads-list');
    list.innerHTML = '<div class="text-xs text-slate-500 dark:text-slate-400 p-2">Loading live road network...</div>';
    try {
        const res = await fetch('/api/roads');
        const roads = await res.json();
        list.innerHTML = '';
        roads.forEach(road => {
            let statusText = road.status || 'Clear';
            let badgeColor = 'bg-emerald-500';
            let statusColorClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';

            if (road.status === 'Blocked' || road.status === 'Red') {
                statusText = 'Blocked (Red)';
                badgeColor = 'bg-rose-500';
                statusColorClass = 'text-rose-400 bg-rose-500/10 border-rose-500/30';
            } else if (road.status === 'Congested' || road.status === 'Orange') {
                statusText = 'Heavy Traffic (Orange)';
                badgeColor = 'bg-orange-500';
                statusColorClass = 'text-orange-400 bg-orange-500/10 border-orange-500/30';
            } else if (road.status === 'Moderate' || road.status === 'Yellow') {
                statusText = 'Moderate (Yellow)';
                badgeColor = 'bg-yellow-400';
                statusColorClass = 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
            }

            const div = document.createElement('div');
            div.className = 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs';
            div.innerHTML = `
                <div>
                    <div class="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full ${badgeColor}"></span> ${road.name}
                    </div>
                    <div class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Status: <span class="px-2 py-0.5 rounded-full border ${statusColorClass}">${statusText}</span></div>
                </div>
                <div class="flex gap-1">
                    <button onclick="setRoadStatusColor('${road.name}', 'Red')" class="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-1 rounded-lg text-[10px] font-medium cursor-pointer" title="Mark Red">Red</button>
                    <button onclick="setRoadStatusColor('${road.name}', 'Orange')" class="bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 py-1 rounded-lg text-[10px] font-medium cursor-pointer" title="Mark Orange">Orange</button>
                    <button onclick="setRoadStatusColor('${road.name}', 'Yellow')" class="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-1 rounded-lg text-[10px] font-medium cursor-pointer" title="Mark Yellow">Yellow</button>
                </div>
            `;
            list.appendChild(div);
        });
    } catch (e) {
        list.innerHTML = '<div class="text-xs text-rose-400 p-2">Failed to fetch road status</div>';
    }
}

async function setRoadStatusColor(roadName, color) {
    try {
        await fetch('/api/blocked', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ road: roadName, status: color })
        });
        alert(`Road "${roadName}" status updated to ${color} successfully.`);
        openRoadStatusModal();
    } catch (e) {
        alert('Failed to update road status.');
    }
}

function closeRoadStatusModal() {
    document.getElementById('road-modal').classList.add('hidden');
}