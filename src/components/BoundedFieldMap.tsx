import { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Rectangle } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useGoogleMapsKey } from '@/hooks/useGoogleMapsKey';

const containerStyle = {
  width: '100%',
  height: 'calc(100vh - 200px)', // Take most of the viewport
  minHeight: '400px'
};

// Default center - London
const defaultCenter = {
  lat: 51.505,
  lng: -0.09
};

// Default zoom level
const DEFAULT_ZOOM = 15;

interface BoundedArea {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface BoundedFieldMapProps {
  apiKey: string;
}

function BoundedFieldMapComponent({ apiKey }: BoundedFieldMapProps) {
  const [boundedArea, setBoundedArea] = useState<BoundedArea | null>(null);
  const [isSettingBounds, setIsSettingBounds] = useState(false);
  const [drawingManager, setDrawingManager] = useState<google.maps.drawing.DrawingManager | null>(null);
  const [currentRectangle, setCurrentRectangle] = useState<google.maps.Rectangle | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const { toast } = useToast();

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries: ['drawing']
  });

  // Load saved boundaries from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('fieldMapBounds');
    if (saved) {
      try {
        const bounds = JSON.parse(saved);
        setBoundedArea(bounds);
      } catch (error) {
        console.error('Failed to load saved bounds:', error);
      }
    }
  }, []);

  // Initialize drawing manager when map is ready
  useEffect(() => {
    if (isLoaded && mapInstance && !drawingManager) {
      const manager = new google.maps.drawing.DrawingManager({
        drawingMode: null,
        drawingControl: false,
        rectangleOptions: {
          strokeColor: '#FF0000',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: '#FF0000',
          fillOpacity: 0.15,
          editable: true,
          draggable: true,
        },
      });

      manager.setMap(mapInstance);
      setDrawingManager(manager);

      // Handle rectangle completion
      google.maps.event.addListener(manager, 'rectanglecomplete', (rectangle: google.maps.Rectangle) => {
        // Remove previous rectangle if exists
        if (currentRectangle) {
          currentRectangle.setMap(null);
        }
        
        setCurrentRectangle(rectangle);
        
        // Get bounds and save
        const bounds = rectangle.getBounds();
        if (bounds) {
          const newBounds = {
            north: bounds.getNorthEast().lat(),
            south: bounds.getSouthWest().lat(),
            east: bounds.getNorthEast().lng(),
            west: bounds.getSouthWest().lng(),
          };
          
          setBoundedArea(newBounds);
          localStorage.setItem('fieldMapBounds', JSON.stringify(newBounds));
          
          toast({
            title: "Area Defined",
            description: "Map boundaries have been set and saved."
          });
          
          setIsSettingBounds(false);
          manager.setDrawingMode(null);
        }
      });
    }
  }, [isLoaded, mapInstance, drawingManager, currentRectangle, toast]);

  const handleSetBounds = useCallback(() => {
    if (drawingManager) {
      setIsSettingBounds(true);
      drawingManager.setDrawingMode(google.maps.drawing.OverlayType.RECTANGLE);
      
      toast({
        title: "Draw Your Area",
        description: "Tap and drag to define the map boundaries."
      });
    }
  }, [drawingManager, toast]);

  const handleResetBounds = useCallback(() => {
    setBoundedArea(null);
    setIsSettingBounds(false);
    localStorage.removeItem('fieldMapBounds');
    
    if (currentRectangle) {
      currentRectangle.setMap(null);
      setCurrentRectangle(null);
    }
    
    if (drawingManager) {
      drawingManager.setDrawingMode(null);
    }

    // Remove map restrictions
    if (mapInstance) {
      mapInstance.setOptions({ restriction: null });
    }
    
    toast({
      title: "Boundaries Reset",
      description: "Map is now unrestricted."
    });
  }, [boundedArea, currentRectangle, drawingManager, mapInstance, toast]);

  const handleMapLoad = useCallback((map: google.maps.Map) => {
    setMapInstance(map);
    
    // Apply restrictions if bounds exist
    if (boundedArea) {
      const restriction = {
        latLngBounds: new google.maps.LatLngBounds(
          new google.maps.LatLng(boundedArea.south, boundedArea.west),
          new google.maps.LatLng(boundedArea.north, boundedArea.east)
        ),
        strictBounds: true,
      };
      map.setOptions({ restriction });
    }
  }, [boundedArea]);

  // Apply restriction when boundedArea changes
  useEffect(() => {
    if (mapInstance && boundedArea) {
      const restriction = {
        latLngBounds: new google.maps.LatLngBounds(
          new google.maps.LatLng(boundedArea.south, boundedArea.west),
          new google.maps.LatLng(boundedArea.north, boundedArea.east)
        ),
        strictBounds: true,
      };
      mapInstance.setOptions({ restriction });
      
      // Fit map to bounded area
      const bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(boundedArea.south, boundedArea.west),
        new google.maps.LatLng(boundedArea.north, boundedArea.east)
      );
      mapInstance.fitBounds(bounds);
    }
  }, [mapInstance, boundedArea]);

  if (loadError) {
    return (
      <div className="flex flex-col justify-center items-center h-96 p-4">
        <p className="text-red-500 font-semibold mb-2">Maps Load Error:</p>
        <p className="text-sm text-muted-foreground text-center">{loadError.message}</p>
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="flex justify-center items-center h-96">Loading Field Map...</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Map Container */}
      <div className="flex-1 relative">
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={defaultCenter}
          zoom={DEFAULT_ZOOM}
          onLoad={handleMapLoad}
          options={{
            // Mobile-optimized options
            disableDefaultUI: true,
            gestureHandling: 'greedy',
            zoomControl: true,
            zoomControlOptions: {
              position: google.maps.ControlPosition.RIGHT_BOTTOM,
            },
            // Disable street view and other desktop features
            streetViewControl: false,
            fullscreenControl: false,
            mapTypeControl: false,
          }}
        >
          {/* Show saved boundary rectangle */}
          {boundedArea && (
            <Rectangle
              bounds={{
                north: boundedArea.north,
                south: boundedArea.south,
                east: boundedArea.east,
                west: boundedArea.west,
              }}
              options={{
                strokeColor: '#4CAF50',
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillColor: '#4CAF50',
                fillOpacity: 0.1,
              }}
            />
          )}
        </GoogleMap>
      </div>

      {/* Mobile-friendly controls at bottom */}
      <div className="p-4 bg-white border-t">
        <div className="flex gap-3 justify-center">
          {!boundedArea ? (
            <Button
              onClick={handleSetBounds}
              disabled={isSettingBounds}
              className="flex-1 h-12 text-lg font-medium"
              size="lg"
            >
              {isSettingBounds ? "Draw Rectangle..." : "Set Map Area"}
            </Button>
          ) : (
            <>
              <Button
                onClick={handleSetBounds}
                disabled={isSettingBounds}
                variant="outline"
                className="flex-1 h-12 text-lg font-medium"
                size="lg"
              >
                {isSettingBounds ? "Drawing..." : "Redefine Area"}
              </Button>
              <Button
                onClick={handleResetBounds}
                variant="destructive"
                className="h-12 px-6 text-lg font-medium"
                size="lg"
              >
                Reset
              </Button>
            </>
          )}
        </div>
        
        <div className="text-center mt-2 text-sm text-muted-foreground">
          {boundedArea ? (
            <span className="text-green-600 font-medium">Map locked to defined area</span>
          ) : (
            <span>Define your field area to restrict map navigation</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function BoundedFieldMap() {
  const { apiKey, loading: keyLoading, error: keyError } = useGoogleMapsKey();

  if (keyLoading) {
    return <div className="flex justify-center items-center h-96">Loading API key...</div>;
  }

  if (keyError) {
    return (
      <div className="flex flex-col justify-center items-center h-96 p-4">
        <p className="text-red-500 font-semibold mb-2">API Key Error:</p>
        <p className="text-sm text-muted-foreground text-center">{keyError}</p>
      </div>
    );
  }

  if (!apiKey) {
    return <div className="flex justify-center items-center h-96">No Google Maps API key available</div>;
  }

  return <BoundedFieldMapComponent apiKey={apiKey} />;
}