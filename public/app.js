let map;
let markers = [];
let currentLocationMarker;
let appConfig;
let geocoder;
let selectedSearchLocation = null;

const searchForm = document.getElementById("searchForm");
const useMyLocationBtn = document.getElementById("useMyLocationBtn");
const resultsList = document.getElementById("resultsList");
const resultCount = document.getElementById("resultCount");
const statusMessage = document.getElementById("statusMessage");
const staticCuisineValue = document.getElementById("staticCuisineValue");
const locationSearchInput = document.getElementById("locationSearch");

async function initialize() {
  appConfig = await fetchJson("/api/config");
  staticCuisineValue.textContent = `${appConfig.staticCuisineQuery} within ${appConfig.searchRadiusKm} km`;

  if (!appConfig.googleMapsApiKey) {
    statusMessage.textContent = "Missing GOOGLE_MAPS_API_KEY. Add it to the runtime environment.";
    return;
  }

  await loadGoogleMaps(appConfig.googleMapsApiKey);
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 40.741, lng: -73.989 },
    zoom: 13,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false
  });

  geocoder = new google.maps.Geocoder();
}

useMyLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    statusMessage.textContent = "Geolocation is not supported in this browser.";
    return;
  }

  statusMessage.textContent = "Fetching your current location…";

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      selectedSearchLocation = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        label: "My current location"
      };

      locationSearchInput.value = selectedSearchLocation.label;
      centerMapOnLocation(selectedSearchLocation);
      statusMessage.textContent = "Current location loaded.";

      try {
        const label = await reverseGeocode(coords.latitude, coords.longitude);
        if (label) {
          selectedSearchLocation.label = label;
          locationSearchInput.value = label;
        }
      } catch (error) {
        console.warn("Reverse geocoding failed", error);
      }
    },
    () => {
      statusMessage.textContent = "Unable to retrieve your current location.";
    }
  );
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    statusMessage.textContent = "Resolving location…";
    const resolvedLocation = await resolveSearchLocation();
    centerMapOnLocation(resolvedLocation);

    const payload = {
      age: Number(document.getElementById("age").value),
      gender: document.getElementById("gender").value,
      countryOfOrigin: document.getElementById("countryOfOrigin").value,
      currentLocation: {
        latitude: resolvedLocation.latitude,
        longitude: resolvedLocation.longitude
      }
    };

    statusMessage.textContent = "Searching restaurants…";

    const response = await fetchJson("/api/restaurants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    renderResults(response.results, resolvedLocation);
    statusMessage.textContent = `${response.results.length} restaurants found near ${resolvedLocation.label}.`;
  } catch (error) {
    console.error(error);
    statusMessage.textContent = error.message || "Search failed.";
  }
});

async function resolveSearchLocation() {
  const rawInput = locationSearchInput.value.trim();

  if (!rawInput) {
    throw new Error("Enter a location to search around.");
  }

  if (
    selectedSearchLocation &&
    selectedSearchLocation.label &&
    rawInput.toLowerCase() === selectedSearchLocation.label.toLowerCase()
  ) {
    return selectedSearchLocation;
  }

  const geocodeResult = await geocodeAddress(rawInput);
  selectedSearchLocation = geocodeResult;
  locationSearchInput.value = geocodeResult.label;
  return geocodeResult;
}

function geocodeAddress(address) {
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address }, (results, status) => {
      if (status !== "OK" || !results || !results.length) {
        reject(new Error("Location not found. Try a more specific place."));
        return;
      }

      const result = results[0];
      const location = result.geometry.location;
      resolve({
        latitude: location.lat(),
        longitude: location.lng(),
        label: result.formatted_address
      });
    });
  });
}

function reverseGeocode(latitude, longitude) {
  return new Promise((resolve, reject) => {
    geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results, status) => {
      if (status !== "OK") {
        reject(new Error("Reverse geocoding failed."));
        return;
      }

      resolve(results?.[0]?.formatted_address || null);
    });
  });
}

function centerMapOnLocation(location) {
  if (!map) return;
  map.setCenter({ lat: location.latitude, lng: location.longitude });
  map.setZoom(13);
}

function renderResults(results, currentLocation) {
  resultCount.textContent = results.length;
  resultsList.innerHTML = "";
  clearMarkers();

  if (!map) return;

  const bounds = new google.maps.LatLngBounds();
  const currentLatLng = {
    lat: currentLocation.latitude,
    lng: currentLocation.longitude
  };

  currentLocationMarker = new google.maps.Marker({
    map,
    position: currentLatLng,
    title: currentLocation.label || "Search location",
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: "#2563eb",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2
    }
  });

  bounds.extend(currentLatLng);

  results.forEach((rslt) => {
    addRestuarantMarker(rslt);
  });

  if (results.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.className = "result-card";
    emptyState.innerHTML = "<p>No matching restaurants found within the configured search radius.</p>";
    resultsList.appendChild(emptyState);
    map.setCenter(currentLatLng);
    map.setZoom(13);
    return;
  }

  //map.fitBounds(bounds, 60);
}

async function addRestuarantMarker(rslt) {
  //const latLng =  await  geocodeAddress('${rslt.address.building} ${rslt.address.street} ${rslt.address.zipcode} ${rslt.borough} New York');
  const marker = new google.maps.Marker({
    map,
    position: { lat: rslt.address.coord[1], lng: rslt.address.coord[0] },
    title: rslt.name
  });

  const infoWindow = new google.maps.InfoWindow({
    content: `
      <div style="max-width:240px;line-height:1.4;">
        <strong>${escapeHtml(rslt.name)}</strong><br />
        ${escapeHtml(rslt.cuisine)}<br />
        ${escapeHtml(formatAddress(rslt.address))}
      </div>
    `
  });

  marker.addListener("click", () => infoWindow.open({ anchor: marker, map }));
  markers.push(marker);
  //bounds.extend(latLng);

  const item = document.createElement("li");
  item.className = "result-card";
  item.innerHTML = `
    <h3>${escapeHtml(rslt.name)}</h3>
    <p><strong>Cuisine:</strong> ${escapeHtml(rslt.cuisine)}</p>
    <p><strong>Address:</strong> ${escapeHtml(formatAddress(rslt.address))}</p>
  `;
  resultsList.appendChild(item);
}

function clearMarkers() {
  markers.forEach((marker) => marker.setMap(null));
  markers = [];
  if (currentLocationMarker) {
    currentLocationMarker.setMap(null);
    currentLocationMarker = null;
  }
}

function formatAddress(address) {
  return [address.building, address.street, address.zipcode].filter(Boolean).join(", ");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load Google Maps."));
    document.head.appendChild(script);
  });
}

initialize().catch((error) => {
  console.error(error);
  statusMessage.textContent = error.message || "Application failed to initialize.";
});