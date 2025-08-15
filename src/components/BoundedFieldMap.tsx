import { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Rectangle } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useGoogleMapsKey } from '@/hooks/useGoogleMapsKey';
import { Plus, Minus, RotateCw, Maximize2 } from 'lucide-react';

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

interface SavedView {
  center: google.maps.LatLngLiteral;
  zoom: number;
  heading: number;
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
  const [savedView, setSavedView] = useState<SavedView | null>(null);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const { toast } = useToast();

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries: ['drawing']
  });

  // Load saved boundaries and view from localStorage
  useEffect(() => {
    const savedBounds = localStorage.getItem('fieldMapBounds');
    const savedViewData = localStorage.getItem('fieldMapSavedView');
    
    if (savedBounds) {
      try {
        const bounds = JSON.parse(savedBounds);
        setBoundedArea(bounds);
      } catch (error) {
        console.error('Failed to load saved bounds:', error);
      }
    }
    
    if (savedViewData) {
      try {
        const view = JSON.parse(savedViewData);
        setSavedView(view);
      } catch (error) {
        console.error('Failed to load saved view:', error);
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
        if (bounds && mapInstance) {
          const newBounds = {
            north: bounds.getNorthEast().lat(),
            south: bounds.getSouthWest().lat(),
            east: bounds.getNorthEast().lng(),
            west: bounds.getSouthWest().lng(),
          };
          
          setBoundedArea(newBounds);
          localStorage.setItem('fieldMapBounds', JSON.stringify(newBounds));
          
          // Auto-fit to boundaries with padding
          mapInstance.fitBounds(bounds, { 
            padding: { top: 50, right: 50, bottom: 50, left: 50 }
          });
          
          // Save the fitted view after a short delay (to let fitBounds complete)
          setTimeout(() => {
            if (mapInstance) {
              const center = mapInstance.getCenter();
              const zoom = mapInstance.getZoom();
              if (center && zoom) {
                const view = {
                  center: { lat: center.lat(), lng: center.lng() },
                  zoom: zoom,
                  heading: mapInstance.getHeading() || 0
                };
                setSavedView(view);
                localStorage.setItem('fieldMapSavedView', JSON.stringify(view));
              }
            }
          }, 500);
          
          toast({
            title: "Area Defined",
            description: "Map auto-fitted to your selected area."
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
    setSavedView(null);
    localStorage.removeItem('fieldMapBounds');
    localStorage.removeItem('fieldMapSavedView');
    
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

  const handleZoomIn = useCallback(() => {
    if (mapInstance) {
      const currentZoom = mapInstance.getZoom() || DEFAULT_ZOOM;
      mapInstance.setZoom(Math.min(currentZoom + 1, 20));
      setCurrentZoom(Math.min(currentZoom + 1, 20));
    }
  }, [mapInstance]);

  const handleZoomOut = useCallback(() => {
    if (mapInstance) {
      const currentZoom = mapInstance.getZoom() || DEFAULT_ZOOM;
      const minZoom = boundedArea ? 10 : 3; // Different limits based on boundary state
      mapInstance.setZoom(Math.max(currentZoom - 1, minZoom));
      setCurrentZoom(Math.max(currentZoom - 1, minZoom));
    }
  }, [mapInstance, boundedArea]);

  const handleResetView = useCallback(() => {
    if (mapInstance && savedView) {
      mapInstance.setCenter(savedView.center);
      mapInstance.setZoom(savedView.zoom);
      mapInstance.setHeading(savedView.heading);
      setCurrentZoom(savedView.zoom);
      
      toast({
        title: "View Reset",
        description: "Returned to original view."
      });
    } else if (mapInstance && boundedArea) {
      // If no saved view, fit to bounds
      const bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(boundedArea.south, boundedArea.west),
        new google.maps.LatLng(boundedArea.north, boundedArea.east)
      );
      mapInstance.fitBounds(bounds, { 
        padding: { top: 50, right: 50, bottom: 50, left: 50 }
      });
    }
  }, [mapInstance, savedView, boundedArea, toast]);

  const handleMapLoad = useCallback((map: google.maps.Map) => {
    setMapInstance(map);
    
    // Add zoom change listener
    map.addListener('zoom_changed', () => {
      const zoom = map.getZoom();
      if (zoom) {
        setCurrentZoom(zoom);
      }
    });
    
    // Apply restrictions if bounds exist
    if (boundedArea) {
      const restriction = {
        latLngBounds: new google.maps.LatLngBounds(
          new google.maps.LatLng(boundedArea.south, boundedArea.west),
          new google.maps.LatLng(boundedArea.north, boundedArea.east)
        ),
        strictBounds: true,
      };
      map.setOptions({ 
        restriction,
        // Enable rotation when boundaries are set
        rotateControl: false, // Still use gestures
        minZoom: 10,
        maxZoom: 20
      });
    } else {
      // Remove restrictions and disable rotation when no boundaries
      map.setOptions({ 
        restriction: null,
        minZoom: 3,
        maxZoom: 20
      });
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
          center={savedView?.center || defaultCenter}
          zoom={savedView?.zoom || DEFAULT_ZOOM}
          heading={boundedArea ? (savedView?.heading || 0) : 0}
          onLoad={handleMapLoad}
          options={{
            // Mobile-optimized options
            disableDefaultUI: true,
            gestureHandling: 'greedy', // Always allow all gestures
            zoomControl: false, // We'll use custom controls
            // Rotation settings based on boundary state
            rotateControl: false, // We'll handle this with gestures
            tilt: 0,
            // Disable street view and other desktop features
            streetViewControl: false,
            fullscreenControl: false,
            mapTypeControl: false,
            // Always enable zoom and pan gestures
            scrollwheel: true,
            disableDoubleClickZoom: false,
            // Allow rotation only when boundary is set
            rotateControlOptions: boundedArea ? undefined : { position: -1 }, // Disable rotation before boundary
            // Zoom limits (wider range before boundary)
            minZoom: boundedArea ? 10 : 3,
            maxZoom: 20,
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
        
        {/* Custom Zoom Controls - Always show for easy access */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
          <Button
            onClick={handleZoomIn}
            size="icon"
            variant="secondary"
            className="w-12 h-12 rounded-full shadow-lg bg-white hover:bg-gray-100"
            aria-label="Zoom in"
          >
            <Plus className="h-6 w-6" />
          </Button>
          <Button
            onClick={handleZoomOut}
            size="icon"
            variant="secondary"
            className="w-12 h-12 rounded-full shadow-lg bg-white hover:bg-gray-100"
            aria-label="Zoom out"
          >
            <Minus className="h-6 w-6" />
          </Button>
        </div>
        
        {/* Reset View Button - Only show when boundaries are set */}
        {boundedArea && (
          <div className="absolute left-4 top-4">
            <Button
              onClick={handleResetView}
              size="sm"
              variant="secondary"
              className="shadow-lg bg-white hover:bg-gray-100"
              aria-label="Reset view"
            >
              <Maximize2 className="h-4 w-4 mr-2" />
              Reset View
            </Button>
          </div>
        )}
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