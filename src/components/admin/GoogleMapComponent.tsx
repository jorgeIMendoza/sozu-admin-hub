import { useCallback, useState } from "react";
import { GoogleMap, useJsApiLoader, Marker } from "@react-google-maps/api";

// Move libraries array outside component to prevent recreation
const libraries: ("places")[] = ["places"];

const containerStyle = {
  width: "100%",
  height: "300px"
};

const defaultCenter = {
  lat: 19.4326,
  lng: -99.1332 // Mexico City
};

// Google Maps API Key - This is a public key that should be restricted by domain
const GOOGLE_MAPS_API_KEY = "AIzaSyBrGiC6e6GtDDxERSChJZaDUa9V4yLvTqg";

interface GoogleMapComponentProps {
  onLocationSelect: (location: { lat: number; lng: number }) => void;
  onAddressSelect?: (address: string) => void;
  initialLocation?: { lat: number; lng: number } | null;
}

export function GoogleMapComponent({ onLocationSelect, onAddressSelect, initialLocation }: GoogleMapComponentProps) {
  const [markerPosition, setMarkerPosition] = useState(initialLocation || null);
  
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: libraries
  });

  const onMapClick = useCallback((event: google.maps.MapMouseEvent) => {
    if (event.latLng) {
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      const newPosition = { lat, lng };
      
      setMarkerPosition(newPosition);
      onLocationSelect(newPosition);
      
      // Reverse geocoding to get address
      if (onAddressSelect && window.google) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location: newPosition }, (results, status) => {
          if (status === 'OK' && results && results[0]) {
            onAddressSelect(results[0].formatted_address);
          }
        });
      }
    }
  }, [onLocationSelect, onAddressSelect]);

  if (!isLoaded) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center bg-muted rounded-lg border">
        <p className="text-muted-foreground">Cargando mapa...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[300px] rounded-lg overflow-hidden border">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={markerPosition || defaultCenter}
        zoom={markerPosition ? 15 : 10}
        onClick={onMapClick}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        }}
      >
        {markerPosition && (
          <Marker
            position={markerPosition}
            animation={google.maps.Animation.DROP}
          />
        )}
      </GoogleMap>
    </div>
  );
}