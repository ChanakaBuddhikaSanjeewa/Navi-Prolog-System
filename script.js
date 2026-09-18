async function calculateRoute() {
    // Start Location එක ටයිප් කරලා විතරක්, select නොකර තිබුණොත් auto fetch කරගන්න
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

    // Destination එක ටයිප් කරලා විතරක්, select නොකර තිබුණොත් auto fetch කරගන්න
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

    // දැන් බලන්න coordinates දෙකම තියෙනවාද කියලා
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