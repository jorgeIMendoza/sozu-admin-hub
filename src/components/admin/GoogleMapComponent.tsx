import { useCallback, useState, useRef } from "react";
import { GoogleMap, useJsApiLoader, Marker, Autocomplete } from "@react-google-maps/api";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

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
  readOnly?: boolean;
}

export function GoogleMapComponent({ onLocationSelect, onAddressSelect, initialLocation, readOnly = false }: GoogleMapComponentProps) {
  const [markerPosition, setMarkerPosition] = useState(initialLocation || null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
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

  const geocodeAddress = useCallback((address: string) => {
    if (!window.google) return;
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address, componentRestrictions: { country: "mx" } }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const loc = results[0].geometry.location;
        const newPosition = { lat: loc.lat(), lng: loc.lng() };
        setMarkerPosition(newPosition);
        onLocationSelect(newPosition);
        if (onAddressSelect) {
          onAddressSelect(results[0].formatted_address);
        }
        if (mapInstance) {
          mapInstance.panTo(newPosition);
          mapInstance.setZoom(15);
        }
      }
    });
  }, [onLocationSelect, onAddressSelect, mapInstance]);

  const onPlaceChanged = useCallback(() => {
    const autocomplete = autocompleteRef.current;
    if (autocomplete) {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const newPosition = { lat, lng };
        
        setMarkerPosition(newPosition);
        onLocationSelect(newPosition);
        
        if (onAddressSelect && place.formatted_address) {
          onAddressSelect(place.formatted_address);
        }
        
        if (mapInstance) {
          mapInstance.panTo(newPosition);
          mapInstance.setZoom(15);
        }
      } else {
        // User pressed Enter without selecting a suggestion — use Geocoder
        const inputText = inputRef.current?.value;
        if (inputText) {
          geocodeAddress(inputText);
        }
      }
    }
  }, [onLocationSelect, onAddressSelect, mapInstance, geocodeAddress]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    setMapInstance(map);
  }, []);

  if (!isLoaded) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center bg-muted rounded-lg border">
        <p className="text-muted-foreground">Cargando mapa...</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      {/* Search bar - only in edit mode */}
      {!readOnly && (
      <Autocomplete
          onLoad={(autocomplete) => {
            autocompleteRef.current = autocomplete;
            autocomplete.setFields(["geometry", "formatted_address", "name"]);
          }}
          onPlaceChanged={onPlaceChanged}
          options={{ componentRestrictions: { country: "mx" } }}
        >
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Buscar dirección..."
              className="pl-8"
            />
          </div>
        </Autocomplete>
      )}
      
      {/* Map */}
      <div className="w-full h-[300px] rounded-lg overflow-hidden border">
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={markerPosition || defaultCenter}
          zoom={markerPosition ? 15 : 10}
          onClick={readOnly ? undefined : onMapClick}
          onLoad={onMapLoad}
          options={{
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            gestureHandling: readOnly ? "none" : "auto",
            zoomControl: !readOnly,
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
    </div>
  );
}
