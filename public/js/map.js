mapboxgl.accessToken = window.mapToken;

const hasCoordinates = listing && listing.geometry && Array.isArray(listing.geometry.coordinates) && listing.geometry.coordinates.length === 2;
const defaultCoords = [77.2090, 28.6139]; // Default coordinates fallback
const coordinates = hasCoordinates ? listing.geometry.coordinates : defaultCoords;

const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v12",
    center: coordinates,
    zoom: hasCoordinates ? 9 : 3,
});

if (hasCoordinates) {
    const marker = new mapboxgl.Marker({color: "red"})
        .setLngLat(coordinates)
        .setPopup(new mapboxgl.Popup({offset: 25})
        .setHTML(`<h4>${listing.title}</h4><p>Exact location will be provided after booking.</p>`))
        .addTo(map);
} else {
    // Show marker or popup with city/country info
    const marker = new mapboxgl.Marker({color: "red"})
        .setLngLat(coordinates)
        .setPopup(new mapboxgl.Popup({offset: 25})
        .setHTML(`<h4>${listing.title}</h4><p>${listing.location}, ${listing.country}</p>`))
        .addTo(map);
}
