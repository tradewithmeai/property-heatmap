import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Rectangle, Polygon, Polyline, DirectionsService, DirectionsRenderer, Marker, Circle } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useGoogleMapsKey } from '@/hooks/useGoogleMapsKey';
import { Plus, Minus, RotateCw, Maximize2 } from 'lucide-react';

// Static libraries array to prevent LoadScript warning - Routes API enabled
const LIBRARIES = ['drawing', 'geometry', 'routes'] as const;

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
  // Dual-zone map locking states
  const [selectedAreaBounds, setSelectedAreaBounds] = useState<BoundedArea | null>(null);
  const [viewableBounds, setViewableBounds] = useState<BoundedArea | null>(null);
  const [contextFrame, setContextFrame] = useState<BoundedArea | null>(null);
  
  // Mode and rotation states
  const [currentMode, setCurrentMode] = useState<'global' | 'map'>('global');
  const [currentHeading, setCurrentHeading] = useState(0);
  const [isRotating, setIsRotating] = useState(false);
  const [rotationStartAngle, setRotationStartAngle] = useState<number | null>(null);
  const [maskPolygonPaths, setMaskPolygonPaths] = useState<google.maps.LatLngLiteral[][]>([]);
  const [maskRectangles, setMaskRectangles] = useState<BoundedArea[]>([]);
  
  // Diagnostic states for mask debugging
  const [debugPolylines, setDebugPolylines] = useState<{
    outer: google.maps.LatLngLiteral[];
    inner: google.maps.LatLngLiteral[];
  } | null>(null);
  
  // Leash system states
  const [leashRadiusMeters, setLeashRadiusMeters] = useState<number>(0);
  const [selectionCenter, setSelectionCenter] = useState<google.maps.LatLng | null>(null);
  
  // Diagnostic states
  const [renderingType, setRenderingType] = useState<string>('UNKNOWN');
  const [currentTilt, setCurrentTilt] = useState<number>(0);
  
  // Directions state
  const [directionsPoints, setDirectionsPoints] = useState<google.maps.LatLngLiteral[]>([]);
  const [directionsResult, setDirectionsResult] = useState<google.maps.DirectionsResult | null>(null);
  const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);
  const [totalDistanceMeters, setTotalDistanceMeters] = useState<number | null>(null);
  const [isToolbarVisible, setIsToolbarVisible] = useState(true);
  
  // User location state
  const [userLocation, setUserLocation] = useState<google.maps.LatLngLiteral | null>(null);
  const [userAccuracy, setUserAccuracy] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  
  // Legacy state for compatibility (will be phased out)
  const [boundedArea, setBoundedArea] = useState<BoundedArea | null>(null);
  const [isSettingBounds, setIsSettingBounds] = useState(false);
  const [drawingManager, setDrawingManager] = useState<google.maps.drawing.DrawingManager | null>(null);
  const [currentRectangle, setCurrentRectangle] = useState<google.maps.Rectangle | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [savedView, setSavedView] = useState<SavedView | null>(null);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const restrictionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const modeTransitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const idleListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const dragendListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const clickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const leashDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES // Static array prevents warning
  });

  // Calculate viewable bounds (2x expansion around selected area)
  const calculateViewableBounds = useCallback((selectedBounds: BoundedArea): BoundedArea => {
    const latHeight = selectedBounds.north - selectedBounds.south;
    const lngWidth = selectedBounds.east - selectedBounds.west;
    
    // Expand by 100% in each direction (making it 2x total size)
    const expandedLat = latHeight * 0.5; // 50% expansion on each side = 100% total
    const expandedLng = lngWidth * 0.5;
    
    // Calculate new bounds with world limits
    const newNorth = Math.min(selectedBounds.north + expandedLat, 85);
    const newSouth = Math.max(selectedBounds.south - expandedLat, -85);
    const newEast = Math.min(selectedBounds.east + expandedLng, 180);
    const newWest = Math.max(selectedBounds.west - expandedLng, -180);
    
    return {
      north: newNorth,
      south: newSouth,
      east: newEast,
      west: newWest
    };
  }, []);

  // Enhanced bounds normalization with antimeridian detection
  const normalizeBounds = useCallback((bounds: BoundedArea): BoundedArea => {
    const normalized = {
      north: Math.max(bounds.north, bounds.south),
      south: Math.min(bounds.north, bounds.south), 
      east: Math.max(bounds.east, bounds.west),
      west: Math.min(bounds.east, bounds.west)
    };
    
    // Check for antimeridian crossing (not supported yet)
    if (bounds.east < bounds.west) {
      console.warn('⚠️ Selection crosses antimeridian - not supported yet');
      // Continue with normalized values for now
    }
    
    if (normalized.north !== bounds.north || normalized.east !== bounds.east) {
      console.log('🔧 Bounds were normalized:', normalized);
    }
    
    return normalized;
  }, []);

  // Calculate 15% context frame around selection
  const calculateContextFrame = useCallback((selection: BoundedArea): BoundedArea => {
    const latSpan = selection.north - selection.south;
    const lngSpan = selection.east - selection.west;
    
    // Expand by 15% (7.5% on each side)
    const latExpansion = latSpan * 0.075;
    const lngExpansion = lngSpan * 0.075;
    
    const contextFrame = {
      north: Math.min(85, selection.north + latExpansion),
      south: Math.max(-85, selection.south - latExpansion),
      east: Math.min(180, selection.east + lngExpansion),
      west: Math.max(-180, selection.west - lngExpansion)
    };
    
    console.log('📏 Context frame (15% expansion):', contextFrame);
    console.log(`📏 Expansion: lat +${latExpansion.toFixed(6)}°, lng +${lngExpansion.toFixed(6)}°`);
    return contextFrame;
  }, []);

  // Create mask polygon for Map Mode (world with hole for 15% context frame)
  const createContextMaskPolygon = useCallback((selectedBounds: BoundedArea): google.maps.LatLngLiteral[][] => {
    console.log('🎭 Creating context mask polygon for bounds:', selectedBounds);
    
    // Normalize bounds and calculate 15% context frame
    const normalized = normalizeBounds(selectedBounds);
    const contextFrame = calculateContextFrame(normalized);
    
    // Store context frame in state for diagnostics
    setContextFrame(contextFrame);
    
    // Outer ring: world boundaries (COUNTER-CLOCKWISE) [TL→BL→BR→TR→TL]
    const outerRing = [
      { lat: 85, lng: -180 },   // Top-Left
      { lat: -85, lng: -180 },  // Bottom-Left  
      { lat: -85, lng: 180 },   // Bottom-Right
      { lat: 85, lng: 180 },    // Top-Right
      { lat: 85, lng: -180 }    // Back to Top-Left (CCW ✅)
    ];
    
    // Inner ring (hole): 15% context frame bounds (CLOCKWISE) [TL→TR→BR→BL→TL]
    const innerRing = [
      { lat: contextFrame.north, lng: contextFrame.west }, // Top-Left
      { lat: contextFrame.north, lng: contextFrame.east }, // Top-Right
      { lat: contextFrame.south, lng: contextFrame.east }, // Bottom-Right
      { lat: contextFrame.south, lng: contextFrame.west }, // Bottom-Left
      { lat: contextFrame.north, lng: contextFrame.west }  // Back to Top-Left (CW ✅)
    ];
    
    console.log('🔄 Outer ring (CCW):', outerRing.map(p => `(${p.lat},${p.lng})`).join(' → '));
    console.log('🔄 Inner ring (CW - context frame):', innerRing.map(p => `(${p.lat},${p.lng})`).join(' → '));
    console.log('📦 Selection:', normalized);
    console.log('📏 Context frame (15% hole):', contextFrame);
    
    // Set debug polylines for visual verification
    setDebugPolylines({ outer: outerRing, inner: innerRing });
    
    // Auto-clear debug polylines after 10 seconds
    setTimeout(() => {
      setDebugPolylines(null);
      console.log('🧹 Debug polylines cleared');
    }, 10000);
    
    return [outerRing, innerRing];
  }, [normalizeBounds, calculateContextFrame]);

  // Create 4 rectangles to mask everything outside the 15% context frame
  const createContextMaskRectangles = useCallback((selectedBounds: BoundedArea): BoundedArea[] => {
    console.log('🟩 Creating context mask rectangles for bounds:', selectedBounds);
    
    // Normalize bounds and calculate 15% context frame
    const normalized = normalizeBounds(selectedBounds);
    const contextFrame = calculateContextFrame(normalized);
    
    // Store context frame in state for diagnostics
    setContextFrame(contextFrame);
    
    const rectangles: BoundedArea[] = [
      // Top: from world top down to context frame top
      { north: 85, south: contextFrame.north, east: 180, west: -180 },
      // Bottom: from context frame bottom down to world bottom  
      { north: contextFrame.south, south: -85, east: 180, west: -180 },
      // Left: between context frame top/bottom, from world left to context frame left
      { north: contextFrame.north, south: contextFrame.south, east: contextFrame.west, west: -180 },
      // Right: between context frame top/bottom, from context frame right to world right
      { north: contextFrame.north, south: contextFrame.south, east: 180, west: contextFrame.east }
    ];
    
    console.log('🟩 Context mask rectangles (outside 15% frame):', rectangles);
    console.log('📦 Selection:', normalized);
    console.log('📏 Context frame:', contextFrame);
    return rectangles;
  }, [normalizeBounds, calculateContextFrame]);

  // Calculate leash radius in metres using computeDistanceBetween
  const calculateLeashRadius = useCallback((bounds: BoundedArea): number => {
    const northeast = new google.maps.LatLng(bounds.north, bounds.east);
    const southwest = new google.maps.LatLng(bounds.south, bounds.west);
    
    // Diagonal in metres using computeDistanceBetween
    const diagonalMeters = google.maps.geometry.spherical.computeDistanceBetween(northeast, southwest);
    
    // leashRadiusMeters = diagonal * 2.25 (start at 2.25× for comfort; tune 2.0–2.75)
    return diagonalMeters * 2.25;
  }, []);

  // Get selection center from selectedAreaBounds
  const getSelectionCenter = useCallback((): google.maps.LatLng | null => {
    if (!selectedAreaBounds) return null;
    
    const centerLat = (selectedAreaBounds.north + selectedAreaBounds.south) / 2;
    const centerLng = (selectedAreaBounds.east + selectedAreaBounds.west) / 2;
    return new google.maps.LatLng(centerLat, centerLng);
  }, [selectedAreaBounds]);

  // Remove existing leash listeners
  const removeLeashListeners = useCallback(() => {
    if (idleListenerRef.current) {
      google.maps.event.removeListener(idleListenerRef.current);
      idleListenerRef.current = null;
    }
    if (dragendListenerRef.current) {
      google.maps.event.removeListener(dragendListenerRef.current);
      dragendListenerRef.current = null;
    }
    if (leashDebounceRef.current) {
      clearTimeout(leashDebounceRef.current);
      leashDebounceRef.current = null;
    }
  }, []);

  // Enforce leash - snap to true center of selected area
  const enforceLeash = useCallback(() => {
    if (!mapInstance || !selectedAreaBounds || leashRadiusMeters === 0) return;
    
    const currentCenter = mapInstance.getCenter();
    if (!currentCenter) return;
    
    // Calculate true center of selected area
    const trueCenter = new google.maps.LatLng(
      (selectedAreaBounds.north + selectedAreaBounds.south) / 2,
      (selectedAreaBounds.east + selectedAreaBounds.west) / 2
    );
    
    const distance = google.maps.geometry.spherical.computeDistanceBetween(currentCenter, trueCenter);
    
    if (distance > leashRadiusMeters) {
      // Snap back to true center of selected area
      mapInstance.panTo(trueCenter);
      console.log('📍 Snapping to centre of selected area', { 
        lat: trueCenter.lat(), 
        lng: trueCenter.lng() 
      });
      console.log(`Leash correction: ${Math.round(distance)}m from center → snapped to center`);
    }
  }, [mapInstance, selectedAreaBounds, leashRadiusMeters]);

  // Add leash listeners with debouncing
  const addLeashListeners = useCallback(() => {
    if (!mapInstance) return;
    
    removeLeashListeners(); // Prevent duplicates
    
    const debouncedEnforceLeash = () => {
      if (leashDebounceRef.current) clearTimeout(leashDebounceRef.current);
      leashDebounceRef.current = setTimeout(() => {
        enforceLeash();
      }, 100); // Debounce corrections 80–120ms
    };
    
    idleListenerRef.current = mapInstance.addListener('idle', debouncedEnforceLeash);
    dragendListenerRef.current = mapInstance.addListener('dragend', debouncedEnforceLeash);
    
    console.log('Leash listeners added with 100ms debouncing');
  }, [mapInstance, removeLeashListeners, enforceLeash]);

  // Calculate extended bounds with padding for Map Mode constraints
  const getExtendedBounds = useCallback((bounds: BoundedArea, paddingFactor = 0.15): google.maps.LatLngBounds => {
    const latDiff = bounds.north - bounds.south;
    const lngDiff = bounds.east - bounds.west;

    const padLat = latDiff * paddingFactor;
    const padLng = lngDiff * paddingFactor;

    const extendedBounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(bounds.south - padLat, bounds.west - padLng),
      new google.maps.LatLng(bounds.north + padLat, bounds.east + padLng)
    );

    console.log(`📦 Extended bounds calculated: +${Math.round(paddingFactor * 100)}% padding`);
    return extendedBounds;
  }, []);

  // Calculate route using DirectionsService with comprehensive error handling
  const calculateRoute = useCallback((points: google.maps.LatLngLiteral[]) => {
    console.log('🚀 calculateRoute called', { 
      points: points.length, 
      hasDirectionsService: !!directionsService, 
      currentDirectionsResult: !!directionsResult,
      serviceReady: directionsService ? 'YES' : 'NO'
    });
    
    if (!directionsService || points.length < 2) {
      console.log('⚠️ calculateRoute skipped', { hasSvc: !!directionsService, len: points.length });
      return;
    }

    const origin = points[0];
    const destination = points[points.length - 1];
    const waypoints = points.slice(1, -1).map(p => ({ location: p, stopover: true }));

    // Enhanced logging for waypoint progression debugging
    console.log('🗺️ Routing request details:', {
      totalPoints: points.length,
      origin: `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`,
      destination: `${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)}`,
      waypoints: waypoints.map((w, i) => `${w.location.lat.toFixed(4)}, ${w.location.lng.toFixed(4)}`),
      waypointsCount: waypoints.length
    });

    const req: google.maps.DirectionsRequest = {
      origin,
      destination,
      waypoints,
      optimizeWaypoints: false,
      travelMode: google.maps.TravelMode.WALKING,
      provideRouteAlternatives: false,
    };

    directionsService.route(req, (result, status) => {
      console.log('🧭 Routing response', { status, hasResult: !!result, result });
      
      if (status === google.maps.DirectionsStatus.OK && result) {
        console.log('🎉 Route calculation SUCCESS', { 
          status, 
          routeCount: result.routes?.length || 0,
          legs: result.routes?.[0]?.legs?.length || 0,
          pointsUsed: points.length 
        });
        setDirectionsResult(result);
        setTotalDistanceMeters(computeTotalDistanceMeters(result));
        console.log(`✅ Route set in state: ${points.length} points`);
      } else {
        // Surface common permission/quota/location issues
        switch (status) {
          case google.maps.DirectionsStatus.ZERO_RESULTS:
            console.warn('❌ No route between selected points.');
            break;
          case google.maps.DirectionsStatus.OVER_QUERY_LIMIT:
            console.warn('❌ Over query limit. Consider slower test clicking.');
            break;
          case google.maps.DirectionsStatus.REQUEST_DENIED:
            console.error('❌ Request denied. Check API key restrictions and that Maps JavaScript API is enabled. If still denied, enable "Directions API" (Routes).');
            break;
          case google.maps.DirectionsStatus.INVALID_REQUEST:
            console.error('❌ Invalid request. Check origin/destination formatting.');
            break;
          default:
            console.error('❌ Directions error:', status);
        }
        setDirectionsResult(null);
        setTotalDistanceMeters(null);
      }
    });
  }, [directionsService]);

  // Helper functions for distance calculation and formatting
  const computeTotalDistanceMeters = useCallback((result: google.maps.DirectionsResult | null) => {
    if (!result || !result.routes?.[0]?.legs?.length) return null;
    const legs = result.routes[0].legs;
    let total = 0;
    for (const leg of legs) {
      if (leg.distance?.value != null) total += leg.distance.value; // meters
    }
    return total || null;
  }, []);

  const formatDistance = useCallback((meters: number | null) => {
    if (meters == null) return '';
    const km = meters / 1000;
    const miles = meters / 1609.344;
    const kmStr = km >= 10 ? km.toFixed(1) : km.toFixed(2);
    const miStr = miles >= 10 ? miles.toFixed(1) : miles.toFixed(2);
    return `${kmStr} km (${miStr} mi)`;
  }, []);

  // Auto-update distance when directionsResult changes
  useEffect(() => {
    console.log('📊 DirectionsResult changed in state', { 
      hasResult: !!directionsResult, 
      routes: directionsResult?.routes?.length || 0 
    });
    setTotalDistanceMeters(computeTotalDistanceMeters(directionsResult));
  }, [directionsResult, computeTotalDistanceMeters]);

  // Start watching user location
  const startLocationWatch = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation not supported');
      toast({ title: "Location Error", description: "Geolocation not supported by browser" });
      return;
    }

    setIsLocating(true);
    console.log('📍 Location: Starting watch...');
    console.log('📍 Location: Navigator available:', 'geolocation' in navigator);
    console.log('📍 Location: Protocol:', window.location.protocol);
    console.log('📍 Location: Hostname:', window.location.hostname);
    
    console.log('📍 Location: Calling watchPosition...');
    
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        console.log('📍 Location: SUCCESS callback triggered');
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(newLocation);
        setUserAccuracy(position.coords.accuracy ?? null);
        setGeoError(null);
        console.log(`📍 Location updated: ${newLocation.lat.toFixed(6)}, ${newLocation.lng.toFixed(6)}, ±${Math.round(position.coords.accuracy)}m`);
      },
      (error) => {
        console.log('📍 Location: ERROR callback triggered');
        const errorMsg = error.message || 'Location error';
        setGeoError(errorMsg);
        setIsLocating(false);
        console.error('📍 Location error:', errorMsg);
        console.error('📍 Location error code:', error.code);
        console.error('📍 Location error details:', error);
        
        if (error.code === error.PERMISSION_DENIED) {
          toast({ title: "Location Permission Denied", description: "Please enable location in browser settings" });
        } else if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
          toast({ title: "HTTPS Required", description: "Location requires HTTPS or localhost" });
        } else {
          toast({ title: "Location Error", description: errorMsg });
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000
      }
    );
    
    console.log('📍 Location: watchPosition called, ID:', watchIdRef.current);
    
    // Add timeout check to detect hanging
    const hangCheckTimeout = setTimeout(() => {
      console.warn('📍 Location: 30 seconds elapsed - checking if location request is hanging');
      console.warn('📍 Location: Watch ID still active:', watchIdRef.current);
    }, 30000);
  }, [toast]);

  // Stop watching user location
  const stopLocationWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      console.log('📍 Location: Stopped watch');
    }
    setIsLocating(false);
  }, []);

  // Render custom direction markers with labels
  const renderDirectionsMarkers = useCallback(() => {
    return directionsPoints.map((point, index) => {
      const label = String.fromCharCode(65 + index); // A, B, C, D...
      const isOrigin = index === 0;
      const isDestination = index === directionsPoints.length - 1;
      
      let fillColor = '#FF9800'; // Orange for waypoints
      if (isOrigin) fillColor = '#4CAF50'; // Green for origin
      if (isDestination && directionsPoints.length > 1) fillColor = '#F44336'; // Red for destination
      
      return (
        <Marker
          key={`direction-marker-${index}`}
          position={point}
          label={{
            text: label,
            color: 'white',
            fontWeight: 'bold',
            fontSize: '12px'
          }}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            fillColor,
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 2,
            scale: 12
          }}
          zIndex={1000}
        />
      );
    });
  }, [directionsPoints]);

  // Floating directions toolbar component
  const DirectionsToolbar = useCallback(() => {
    if (directionsPoints.length === 0) return null;
    
    // Show collapsed Menu button when toolbar is hidden
    if (!isToolbarVisible) {
      return (
        <div className="absolute bottom-20 right-4 z-20">
          <Button
            size="sm"
            variant="default"
            className="shadow-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
            onClick={() => {
              setIsToolbarVisible(true);
              console.log('👁️ Directions toolbar shown');
            }}
          >
            Menu ⬆️
          </Button>
        </div>
      );
    }
    
    return (
      <div className="absolute bottom-20 right-4 flex flex-col gap-2 z-20">
        {/* Distance display chip */}
        {totalDistanceMeters != null && (
          <div className="shadow-lg bg-white/95 backdrop-blur px-3 py-2 rounded-xl text-sm font-medium text-gray-800 border border-gray-200">
            Total distance: {formatDistance(totalDistanceMeters)}
          </div>
        )}
        
        <Button
          size="sm"
          variant="secondary"
          className="shadow-lg bg-white hover:bg-gray-100 text-xs"
          onClick={() => {
            setDirectionsPoints([]);
            setDirectionsResult(null);
            setTotalDistanceMeters(null);
            setIsToolbarVisible(true); // Reset toolbar visibility when clearing
            console.log('🧹 Cleared all direction points');
            toast({ title: "Directions cleared" });
          }}
        >
          Clear
        </Button>
        
        <Button
          size="sm"
          variant="secondary"
          className="shadow-lg bg-white hover:bg-gray-100 text-xs"
          onClick={() => {
            if (directionsPoints.length === 0) return;
            
            const newPoints = directionsPoints.slice(0, -1);
            setDirectionsPoints(newPoints);
            
            if (newPoints.length >= 2) {
              calculateRoute(newPoints);
            } else {
              setDirectionsResult(null);
              setTotalDistanceMeters(null);
            }
            
            console.log(`↩️ Removed last point, ${newPoints.length} remaining`);
            toast({ title: `Point ${String.fromCharCode(65 + directionsPoints.length - 1)} removed` });
          }}
        >
          Undo
        </Button>
        
        <Button
          size="sm"
          variant="secondary"
          className="shadow-lg bg-white hover:bg-gray-100 text-xs"
          onClick={() => {
            if (directionsPoints.length >= 2) {
              calculateRoute(directionsPoints);
              toast({ title: "Route recalculated" });
            }
          }}
          disabled={directionsPoints.length < 2}
        >
          Route
        </Button>
        
        <Button
          size="sm"
          variant="secondary"
          className="shadow-lg bg-white hover:bg-gray-100 text-xs"
          onClick={() => {
            setIsToolbarVisible(false);
            console.log('👁️ Directions toolbar hidden');
            toast({ title: "Menu hidden - click Menu button to show" });
          }}
        >
          Hide ⬇️
        </Button>
      </div>
    );
  }, [directionsPoints, calculateRoute, toast, totalDistanceMeters, formatDistance, isToolbarVisible, setIsToolbarVisible]);

  // Setup click handler for mode switching - simplified to avoid infinite loops
  const setupClickHandler = useCallback(() => {
    if (!mapInstance || !selectedAreaBounds) {
      console.log('❌ Click handler setup failed: missing mapInstance or selectedAreaBounds');
      return;
    }
    
    // Remove existing click listener
    if (clickListenerRef.current) {
      google.maps.event.removeListener(clickListenerRef.current);
      clickListenerRef.current = null;
      console.log('🧹 Removed old click listener');
    }
    
    // Add new click listener with simplified mode switching
    clickListenerRef.current = mapInstance.addListener('click', (event: google.maps.MapMouseEvent) => {
      if (!selectedAreaBounds || !event.latLng) return;
      
      // Use bounds.contains for rotation-independent detection
      const bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(selectedAreaBounds.south, selectedAreaBounds.west),
        new google.maps.LatLng(selectedAreaBounds.north, selectedAreaBounds.east)
      );
      
      const clickedInside = bounds.contains(event.latLng);
      
      // Direct mode switching without complex function calls to avoid infinite loops
      if (clickedInside) {
        console.log('🗺️ mode: map ← reason=click-inside');
        setCurrentMode('map');
        localStorage.setItem('fieldMapCurrentMode', 'map');
        
        // Directions logic - place points when clicking inside bounds (we're now in Map Mode)
        const newPoint = {
          lat: event.latLng.lat(),
          lng: event.latLng.lng()
        };
        
        setDirectionsPoints(prev => {
          const newPoints = [...prev, newPoint];
          const pointLabel = String.fromCharCode(65 + prev.length);
          console.log(`📍 Added direction point ${pointLabel} at ${newPoint.lat.toFixed(4)}, ${newPoint.lng.toFixed(4)}`);
          
          // Show toolbar when new points are added so user can see the menu
          setIsToolbarVisible(true);
          
          // Enhanced progression logging
          if (newPoints.length === 1) {
            console.log('🎯 Origin set:', pointLabel);
          } else if (newPoints.length === 2) {
            console.log('🏁 Destination set:', pointLabel, '(Route A→B)');
          } else {
            const prevDest = String.fromCharCode(65 + prev.length - 2);
            console.log(`🏁 New destination: ${pointLabel} (${prevDest} becomes waypoint)`);
          }
          
          console.log('🗺️ Direction points state:', { 
            previousLength: prev.length, 
            newLength: newPoints.length, 
            sequence: newPoints.map((_, i) => String.fromCharCode(65 + i)).join('→')
          });
          
          // Auto-calculate route if we have 2+ points (using fresh points array)
          if (newPoints.length >= 2) {
            console.log('🧭 Triggering route calculation', { pointCount: newPoints.length, hasDirectionsService: !!directionsService });
            calculateRoute(newPoints);
          } else {
            console.log('🧭 Route calculation skipped - need 2+ points', { currentCount: newPoints.length });
          }
          
          return newPoints;
        });
        
        // Auto-zoom and center on selected area when entering Map Mode
        setTimeout(() => {
          if (mapInstance && selectedAreaBounds) {
            // Calculate center of selected area
            const center = {
              lat: (selectedAreaBounds.north + selectedAreaBounds.south) / 2,
              lng: (selectedAreaBounds.east + selectedAreaBounds.west) / 2,
            };
            
            // Smooth pan to center
            mapInstance.panTo(center);
            console.log('📍 Map snapped to center:', center);
            
            // Apply zoom with bounds for consistent framing
            const bounds = new google.maps.LatLngBounds(
              new google.maps.LatLng(selectedAreaBounds.south, selectedAreaBounds.west),
              new google.maps.LatLng(selectedAreaBounds.north, selectedAreaBounds.east)
            );
            mapInstance.fitBounds(bounds, { 
              padding: { top: 60, right: 60, bottom: 100, left: 60 }
            });
            console.log('🔍 Auto-zoomed to selected area in Map Mode');
          }
        }, 100); // Debounced slightly to avoid conflicts
      } else {
        console.log('🌍 mode: global ← reason=click-outside');
        setCurrentMode('global');
        localStorage.setItem('fieldMapCurrentMode', 'global');
      }
    });
    
    console.log('✅ Click handler setup successful');
  }, [mapInstance, selectedAreaBounds, currentMode, calculateRoute]);

  // Memoized map options to prevent re-renders
  const mapOptions = useMemo(() => ({
    // Enable vector rendering for rotation support
    mapId: "3ea08160561a9368c8d75477", // Vector map with tilt and rotation enabled
    
    // Physical map emulation - maximum gesture freedom  
    disableDefaultUI: false, // Allow compass and scale controls to show
    gestureHandling: 'greedy', // Always allow all gestures
    zoomControl: false, // We'll use custom controls
    
    // Enable full rotation control
    rotateControl: true, // Show compass control for orientation
    tilt: 45, // Enable 45° aerial perspective
    
    // Enable all rotation gestures
    isFractionalZoomEnabled: true,
    
    // Enable orientation and scale controls for field navigation
    scaleControl: true, // Show distance scale
    
    // Disable other auto-adjustments
    streetViewControl: false,
    fullscreenControl: false,
    mapTypeControl: false,
    
    // Unrestricted navigation in both modes (leash handles Map Mode constraints)
    restriction: null,
    strictBounds: false,
    minZoom: 1,  // Satellite level zoom out
    maxZoom: 22, // Detailed zoom in
    
    // Essential interaction
    scrollwheel: true,
    disableDoubleClickZoom: false,
    
    // Wide zoom range for physical map emulation
    backgroundColor: '#f5f5f5',
    
    // Enable right-click for rotation, but disable POI clicks
    clickableIcons: false, // Prevent accidental clicks on POI icons
    keyboardShortcuts: false,
  }), []);

  // Load saved boundaries, mode, heading, and view from localStorage
  useEffect(() => {
    const savedBounds = localStorage.getItem('fieldMapBounds');
    const savedSelectedArea = localStorage.getItem('fieldMapSelectedArea');
    const savedViewableBounds = localStorage.getItem('fieldMapViewableBounds');
    const savedViewData = localStorage.getItem('fieldMapSavedView');
    const savedMode = localStorage.getItem('fieldMapCurrentMode');
    const savedHeading = localStorage.getItem('fieldMapHeading');
    
    // Load mode and heading
    if (savedMode === 'map' || savedMode === 'global') {
      setCurrentMode(savedMode);
    }
    
    if (savedHeading) {
      const heading = parseFloat(savedHeading);
      if (!isNaN(heading)) {
        setCurrentHeading(heading);
      }
    }
    
    if (savedSelectedArea) {
      try {
        const selectedBounds = JSON.parse(savedSelectedArea);
        setSelectedAreaBounds(selectedBounds);
        setBoundedArea(selectedBounds); // Legacy compatibility
      } catch (error) {
        console.error('Failed to load saved selected area:', error);
      }
    } else if (savedBounds) {
      // Fallback to legacy bounds format
      try {
        const bounds = JSON.parse(savedBounds);
        setSelectedAreaBounds(bounds);
        setBoundedArea(bounds);
      } catch (error) {
        console.error('Failed to load saved bounds:', error);
      }
    }
    
    if (savedViewableBounds) {
      try {
        const viewBounds = JSON.parse(savedViewableBounds);
        setViewableBounds(viewBounds);
      } catch (error) {
        console.error('Failed to load saved viewable bounds:', error);
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

  // Setup click handler for mode switching
  useEffect(() => {
    setupClickHandler();
    
    // Cleanup on unmount or dependency change
    return () => {
      if (clickListenerRef.current) {
        google.maps.event.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
        console.log('🧹 Click listener cleanup on unmount');
      }
    };
  }, [setupClickHandler]);

  // Constrain panning in Map Mode using extended bounds - snap to center
  useEffect(() => {
    if (!mapInstance || currentMode !== 'map' || !selectedAreaBounds) return;

    const extendedBounds = getExtendedBounds(selectedAreaBounds);
    console.log('🔒 Map Mode panning constraints activated');
    
    const handleIdle = () => {
      const currentMapCenter = mapInstance.getCenter();
      if (!currentMapCenter || extendedBounds.contains(currentMapCenter)) return;
      
      // Calculate true center of selected area
      const trueCenter = {
        lat: (selectedAreaBounds.north + selectedAreaBounds.south) / 2,
        lng: (selectedAreaBounds.east + selectedAreaBounds.west) / 2
      };
      
      // Snap back to true center of selected area
      mapInstance.panTo(trueCenter);
      console.log('📍 Snapping to centre of selected area', trueCenter);
      console.log('🧲 Panning constrained: snapped back to center');
    };

    const idleListener = mapInstance.addListener('idle', handleIdle);
    
    return () => {
      google.maps.event.removeListener(idleListener);
      console.log('🔓 Map Mode panning constraints deactivated');
    };
  }, [mapInstance, currentMode, selectedAreaBounds, getExtendedBounds]);

  // TEMPORARY: Set test heading to display compass control for testing
  useEffect(() => {
    if (mapInstance) {
      // Map loaded - test tilt and rotation capabilities
      console.log('🧭 Map loaded with rotation enabled');
      console.log('🧭 Vector rendering:', mapInstance.getRenderingType());
      
      // Test tilt support
      setTimeout(() => {
        const supportsTilt = mapInstance.getTilt() !== undefined;
        const currentTilt = mapInstance.getTilt();
        
        if (supportsTilt && currentTilt === 45) {
          console.log('✅ 45° tilt supported and active');
        } else if (supportsTilt) {
          console.log(`⚠️ Tilt supported but at ${currentTilt}° instead of 45°`);
        } else {
          console.log('❌ Tilt not supported on this device/browser');
        }
        
        console.log('🧭 Rotation controls available via:');
        console.log('   📱 Mobile: Two-finger rotation gestures');
        console.log('   🖥️ Desktop: Right-click + drag');
        console.log('   🎮 Programmatic: Test Rotation button');
      }, 1000);
    }
  }, [mapInstance]);

  // Initialize DirectionsService when map is ready
  useEffect(() => {
    console.log('🔧 DirectionsService effect', { hasMap: !!mapInstance, hasService: !!directionsService });
    if (mapInstance && !directionsService) {
      console.log('🚀 Creating new DirectionsService...');
      const service = new google.maps.DirectionsService();
      setDirectionsService(service);
      console.log('✅ DirectionsService initialized and set to state');
    }
  }, [mapInstance, directionsService]);

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
          editable: false,  // Prevent editing after drawing
          draggable: false, // Prevent dragging after drawing
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
        
        // Hide the red drawing rectangle immediately after getting bounds
        setTimeout(() => {
          rectangle.setMap(null);
        }, 100);
        
        setCurrentRectangle(null); // Don't store the red rectangle
        
        // Get bounds and save
        const bounds = rectangle.getBounds();
        if (bounds && mapInstance) {
          const newSelectedBounds = {
            north: bounds.getNorthEast().lat(),
            south: bounds.getSouthWest().lat(),
            east: bounds.getNorthEast().lng(),
            west: bounds.getSouthWest().lng(),
          };
          
          // Calculate viewable bounds (2x expansion)
          const newViewableBounds = calculateViewableBounds(newSelectedBounds);
          
          // Update states
          setSelectedAreaBounds(newSelectedBounds);
          setViewableBounds(newViewableBounds);
          setBoundedArea(newSelectedBounds); // Legacy compatibility
          
          // Create context mask (prefer rectangles over polygon)
          const maskRects = createContextMaskRectangles(newSelectedBounds);
          setMaskRectangles(maskRects);
          
          // Alternative: polygon mask (comment out rectangles above to use this)
          // const maskPaths = createContextMaskPolygon(newSelectedBounds);
          // setMaskPolygonPaths(maskPaths);
          
          // Calculate leash radius and set selection center
          const radius = calculateLeashRadius(newSelectedBounds);
          setLeashRadiusMeters(radius);
          
          const center = getSelectionCenter();
          setSelectionCenter(center);
          
          console.log(`Leash system initialized: radius=${Math.round(radius)}m, center=${center?.lat()}, ${center?.lng()}`);
          
          // Save to localStorage
          localStorage.setItem('fieldMapSelectedArea', JSON.stringify(newSelectedBounds));
          localStorage.setItem('fieldMapViewableBounds', JSON.stringify(newViewableBounds));
          localStorage.setItem('fieldMapBounds', JSON.stringify(newSelectedBounds)); // Legacy compatibility
          
          // Auto-fit to boundaries with generous padding for better visibility
          mapInstance.fitBounds(bounds, { 
            padding: { top: 80, right: 80, bottom: 120, left: 80 } // Extra bottom padding for controls
          });
          
          // Auto-switch to Map Mode immediately after boundary completion
          setTimeout(() => {
            if (mapInstance && newSelectedBounds) {
              // Auto-enter Map Mode
              setCurrentMode('map');
              localStorage.setItem('fieldMapCurrentMode', 'map');
              
              // Remove ALL restrictions - free zoom in Map Mode
              mapInstance.setOptions({
                restriction: null, // No restrictions
                minZoom: 1,  // Free zoom out to satellite level
                maxZoom: 22, // Detailed zoom in
                // Keep essential controls
                disableDoubleClickZoom: false,
                scrollwheel: true,
                gestureHandling: 'greedy',
                // Prevent automatic map adjustments
                mapTypeControl: false,
                streetViewControl: false,
              });
              
              // Add leash listeners for Map Mode
              addLeashListeners();
              
              console.log('Auto-entered Map Mode with leash system:', {
                selectedArea: newSelectedBounds,
                viewableBounds: newViewableBounds,
                leashRadius: Math.round(radius)
              });
              
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
          }, 800); // Longer delay to ensure fitBounds completes
          
          toast({
            title: "Paper Map Mode Activated",
            description: "Area defined with 2x navigation boundary like a paper map on a table."
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
        description: "Tap and drag to define your paper map area."
      });
    }
  }, [drawingManager, toast]);

  const handleResetBounds = useCallback(() => {
    // Force complete reset - reload the page if needed
    const forceReset = () => {
      window.location.reload();
    };
    
    // Clear any pending restriction timeouts
    if (restrictionTimeoutRef.current) {
      clearTimeout(restrictionTimeoutRef.current);
      restrictionTimeoutRef.current = null;
    }
    
    // Clear all stored data first
    localStorage.removeItem('fieldMapBounds');
    localStorage.removeItem('fieldMapSelectedArea');
    localStorage.removeItem('fieldMapViewableBounds');
    localStorage.removeItem('fieldMapSavedView');
    
    // Reset component state
    setSelectedAreaBounds(null);
    setViewableBounds(null);
    setContextFrame(null);
    setBoundedArea(null); // Legacy compatibility
    setIsSettingBounds(false);
    setSavedView(null);
    setCurrentZoom(DEFAULT_ZOOM);
    setMaskRectangles([]);
    setMaskPolygonPaths([]);
    
    // Clear any drawing rectangles (shouldn't be any but just in case)
    if (currentRectangle) {
      currentRectangle.setMap(null);
      setCurrentRectangle(null);
    }
    
    if (drawingManager) {
      drawingManager.setDrawingMode(null);
    }

    // Aggressively reset map
    if (mapInstance) {
      // Remove ALL restrictions and options
      mapInstance.setOptions({ 
        restriction: null,
        minZoom: 3,
        maxZoom: 20,
        strictBounds: false,
        // Force refresh of map behavior
        gestureHandling: 'greedy',
        zoomControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        mapTypeControl: false,
        scrollwheel: true,
        disableDoubleClickZoom: false,
        keyboardShortcuts: false,
      });
      
      // Force return to default view
      setTimeout(() => {
        if (mapInstance) {
          mapInstance.setCenter(defaultCenter);
          mapInstance.setZoom(DEFAULT_ZOOM);
          mapInstance.setHeading(0);
        }
      }, 100);
      
      // If still stuck after 2 seconds, force reload
      setTimeout(() => {
        const currentCenter = mapInstance.getCenter();
        const currentZoom = mapInstance.getZoom();
        
        // Check if map is still stuck on the old view
        if (currentCenter && (
          Math.abs(currentCenter.lat() - defaultCenter.lat) > 0.01 ||
          Math.abs(currentCenter.lng() - defaultCenter.lng) > 0.01 ||
          Math.abs((currentZoom || 0) - DEFAULT_ZOOM) > 1
        )) {
          console.log('Map stuck, forcing page reload...');
          forceReset();
        }
      }, 2000);
    }
    
    toast({
      title: "Paper Map Reset",
      description: "Map being reset to initial view..."
    });
  }, [currentRectangle, drawingManager, mapInstance, toast]);

  const handleZoomIn = useCallback(() => {
    if (mapInstance) {
      const currentZoom = mapInstance.getZoom() || DEFAULT_ZOOM;
      const maxZoom = 25; // Allow extreme zoom in
      
      const newZoom = Math.min(currentZoom + 1, maxZoom);
      mapInstance.setZoom(newZoom);
      setCurrentZoom(newZoom);
      
      console.log(`Zoom in: ${currentZoom} -> ${newZoom}, unlimited range`);
    }
  }, [mapInstance]);

  const handleZoomOut = useCallback(() => {
    if (mapInstance) {
      const currentZoom = mapInstance.getZoom() || DEFAULT_ZOOM;
      // Allow extreme zoom out for physical map emulation
      const minZoom = 1; // No restrictions - zoom to satellite level
      
      const newZoom = Math.max(currentZoom - 1, minZoom);
      mapInstance.setZoom(newZoom);
      setCurrentZoom(newZoom);
      
      console.log(`Zoom out: ${currentZoom} -> ${newZoom}, unlimited range`);
    }
  }, [mapInstance]);

  // Switch to Global Mode (unrestricted navigation)
  const switchToGlobalMode = useCallback(() => {
    if (!mapInstance) return;
    
    console.log('🌍 SWITCHING TO GLOBAL MODE');
    setCurrentMode('global');
    localStorage.setItem('fieldMapCurrentMode', 'global');
    
    // Remove leash listeners in Global Mode
    removeLeashListeners();
    console.log('🚫 Leash listeners removed');
    
    // Remove all restrictions immediately
    mapInstance.setOptions({
      restriction: null,
      minZoom: 1, // No clamp - allow full zoom out
      maxZoom: 22,
      gestureHandling: 'greedy',
    });
    
    // Restriction audit logging
    console.log('✅ Global Mode restrictions audit: restriction=null, strictBounds=false, unlimited zoom');
    
    // Mask will be hidden by React based on currentMode state
    console.log('✅ Global Mode active - unrestricted navigation, no leash, no mask');
  }, [mapInstance, removeLeashListeners]);

  // Switch to Map Mode (constrained navigation with mask)
  const switchToMapMode = useCallback(() => {
    if (!mapInstance || !selectedAreaBounds || !viewableBounds) return;
    
    console.log('🗺️ SWITCHING TO MAP MODE');
    setCurrentMode('map');
    localStorage.setItem('fieldMapCurrentMode', 'map');
    
    // Fit to selected area first
    const bounds = new google.maps.LatLngBounds(
      new google.maps.LatLng(selectedAreaBounds.south, selectedAreaBounds.west),
      new google.maps.LatLng(selectedAreaBounds.north, selectedAreaBounds.east)
    );
    mapInstance.fitBounds(bounds, { 
      padding: { top: 60, right: 60, bottom: 100, left: 60 }
    });
    
    // Clear any existing timeout
    if (modeTransitionTimeoutRef.current) {
      clearTimeout(modeTransitionTimeoutRef.current);
    }
    
    // Apply Map Mode settings (no restrictions, free zoom)
    modeTransitionTimeoutRef.current = setTimeout(() => {
      if (mapInstance) {
        mapInstance.setOptions({
          restriction: null, // No restrictions in Map Mode
          minZoom: 1,  // Free zoom out to satellite level
          maxZoom: 22, // Detailed zoom in
          gestureHandling: 'greedy',
        });
        
        // Restriction audit logging
        console.log('✅ Map Mode restrictions audit: restriction=null, strictBounds=false, unlimited zoom');
        
        // Add leash listeners for Map Mode
        addLeashListeners();
        
        console.log('Map Mode applied - free zoom with soft leash');
      }
    }, 100); // Shorter delay, no restrictions to apply
    
    // Update context mask
    if (selectedAreaBounds) {
      const maskRects = createContextMaskRectangles(selectedAreaBounds);
      setMaskRectangles(maskRects);
      
      // Alternative: polygon mask (comment out rectangles above to use this)
      // const maskPaths = createContextMaskPolygon(selectedAreaBounds);
      // setMaskPolygonPaths(maskPaths);
    }
    
    console.log('Switched to Map Mode - free zoom with soft leash');
  }, [mapInstance, selectedAreaBounds, viewableBounds, createContextMaskRectangles, addLeashListeners]);

  const handleResetView = useCallback(() => {
    if (mapInstance && selectedAreaBounds) {
      // Always reset to center of selected area with reasonable zoom and north-up orientation
      const centerLat = (selectedAreaBounds.north + selectedAreaBounds.south) / 2;
      const centerLng = (selectedAreaBounds.east + selectedAreaBounds.west) / 2;
      const center = { lat: centerLat, lng: centerLng };
      
      // Calculate appropriate zoom level for the selected area
      const bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(selectedAreaBounds.south, selectedAreaBounds.west),
        new google.maps.LatLng(selectedAreaBounds.north, selectedAreaBounds.east)
      );
      
      // Fit to selected area with padding
      mapInstance.fitBounds(bounds, { 
        padding: { top: 60, right: 60, bottom: 100, left: 60 } // Extra bottom padding for controls
      });
      
      // Reset heading to north-up and force Map Mode
      setTimeout(() => {
        if (mapInstance) {
          mapInstance.setHeading(0); // North-up orientation
          mapInstance.setTilt(45); // Enable 45° aerial view
          setCurrentHeading(0);
          localStorage.setItem('fieldMapHeading', '0');
          
          const zoom = mapInstance.getZoom();
          if (zoom) {
            setCurrentZoom(zoom);
          }
          
          // Force switch to Map Mode
          switchToMapMode();
        }
      }, 200);
      
      toast({
        title: "View Reset",
        description: "Centered on area, north-up, Map Mode active"
      });
    }
  }, [mapInstance, selectedAreaBounds, toast, switchToMapMode]);

  const handleMapLoad = useCallback((map: google.maps.Map) => {
    setMapInstance(map);
    
    // Check rendering type - CRITICAL for rotation
    const rendering = map.getRenderingType();
    setRenderingType(rendering);
    console.log('🔍 MAP RENDERING TYPE:', rendering, rendering === 'VECTOR' ? '✅' : '❌ ROTATION WILL NOT WORK!');
    
    // Apply saved heading and force tilt to 0
    if (currentHeading !== undefined) {
      map.setHeading(currentHeading);
      map.setTilt(45); // Enable 45° aerial perspective
      setCurrentTilt(45);
      console.log(`📐 Initial heading: ${currentHeading}°, tilt: 45°`);
    }
    
    // Test rotation capability
    setTimeout(() => {
      const testHeading = 45;
      map.setHeading(testHeading);
      map.setTilt(45);
      const actualHeading = map.getHeading();
      console.log(`🔄 Rotation test: set ${testHeading}°, got ${actualHeading}°`, 
        actualHeading === testHeading ? '✅ WORKING' : '❌ BROKEN');
      // Restore original heading
      map.setHeading(currentHeading);
    }, 1000);
    
    // Add zoom change listener
    map.addListener('zoom_changed', () => {
      const zoom = map.getZoom();
      if (zoom) {
        setCurrentZoom(zoom);
      }
    });
    
    // Click handler now managed separately via setupClickHandler useEffect
    // No restrictions applied here - leash system handles Map Mode constraints
    console.log('✅ Map loaded with unrestricted navigation - leash system will handle Map Mode constraints');
    
    // Log Google Maps environment for diagnostics
    console.log('🔧 Libraries loaded:', (window as any).google?.maps?.libraries);
  }, [currentHeading, selectedAreaBounds, currentMode, viewableBounds, switchToMapMode, switchToGlobalMode]);

  // Setup right-click + drag rotation handlers
  useEffect(() => {
    if (!mapInstance) return;
    
    const mapDiv = mapInstance.getDiv();
    const deadZone = 8; // pixels
    let startMousePos: { x: number; y: number } | null = null;
    let startHeading = currentHeading;
    
    // Calculate angle from map center to mouse position
    const calculateAngle = (mouseX: number, mouseY: number) => {
      const rect = mapDiv.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = mouseX - centerX;
      const dy = mouseY - centerY;
      return Math.atan2(dx, dy) * (180 / Math.PI);
    };
    
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2) { // Right click
        e.preventDefault();
        startMousePos = { x: e.clientX, y: e.clientY };
        startHeading = mapInstance.getHeading() || 0;
        setRotationStartAngle(calculateAngle(e.clientX, e.clientY));
      }
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (startMousePos && rotationStartAngle !== null) {
        const distance = Math.sqrt(
          Math.pow(e.clientX - startMousePos.x, 2) + 
          Math.pow(e.clientY - startMousePos.y, 2)
        );
        
        if (distance > deadZone) {
          if (!isRotating) {
            setIsRotating(true);
          }
          
          const currentAngle = calculateAngle(e.clientX, e.clientY);
          const deltaAngle = currentAngle - rotationStartAngle;
          const newHeading = (startHeading - deltaAngle + 360) % 360;
          
          mapInstance.setHeading(newHeading);
          mapInstance.setTilt(45); // Maintain 45° aerial view
          
          // Always ensure tilt stays at 45° after heading changes
          setTimeout(() => {
            const tilt = mapInstance.getTilt();
            if (tilt !== 45) {
              mapInstance.setTilt(45);
              console.log(`📐 Tilt adjusted from ${tilt}° to 45°`);
            }
            setCurrentTilt(45);
          }, 50);
          
          setCurrentHeading(newHeading);
          localStorage.setItem('fieldMapHeading', newHeading.toString());
          console.log(`🔄 Rotation: ${Math.round(newHeading)}°`);
        }
      }
    };
    
    const handleMouseUp = () => {
      startMousePos = null;
      setIsRotating(false);
      setRotationStartAngle(null);
    };
    
    const handleContextMenu = (e: MouseEvent) => {
      if (isRotating) {
        e.preventDefault(); // Only prevent context menu during rotation
      }
    };
    
    // Add event listeners
    mapDiv.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    mapDiv.addEventListener('contextmenu', handleContextMenu);
    
    // Cleanup
    return () => {
      mapDiv.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      mapDiv.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [mapInstance, currentHeading, isRotating, rotationStartAngle]);

  // Restrictions removed - leash system handles Map Mode constraints
  // Keep only timeout cleanup
  useEffect(() => {
    return () => {
      if (restrictionTimeoutRef.current) {
        clearTimeout(restrictionTimeoutRef.current);
      }
      if (modeTransitionTimeoutRef.current) {
        clearTimeout(modeTransitionTimeoutRef.current);
      }
    };
  }, []);

  // Cleanup location watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        console.log('🧹 Location: Cleanup watch on unmount');
      }
    };
  }, []);

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
      {/* Diagnostic HUD Overlay */}
      <div className="absolute top-4 left-4 z-50 bg-black/80 text-white p-3 rounded-lg text-xs font-mono">
        <div>Mode: <span className={currentMode === 'map' ? 'text-green-400' : 'text-blue-400'}>{currentMode.toUpperCase()}</span></div>
        <div>Rendering: <span className={renderingType === 'VECTOR' ? 'text-green-400' : 'text-red-400'}>{renderingType}</span></div>
        <div>Heading: {Math.round(currentHeading)}°</div>
        <div>Tilt: {currentTilt}°</div>
        <div>Mask: {currentMode === 'map' && maskPolygonPaths.length > 0 ? '✅ POLYGON (15%)' : currentMode === 'map' && maskRectangles.length > 0 ? '🟩 RECTS (15%)' : '❌ OFF'}</div>
        <div>Context: {contextFrame && selectedAreaBounds ? `+${Math.round(((contextFrame.north - selectedAreaBounds.north) / (selectedAreaBounds.north - selectedAreaBounds.south)) * 100)}%` : 'OFF'}</div>
        <div>Debug: {debugPolylines ? '🔴 GREEN=Outer, RED=Context' : '⚫ OFF'}</div>
        <div>Leash: {currentMode === 'map' ? '✅ ON' : '❌ OFF'} {currentMode === 'map' ? `(${Math.round(leashRadiusMeters)}m)` : ''}</div>
        <div>Directions: {directionsResult ? '✅ drawn' : (directionsPoints.length >= 2 ? '❌ no result' : '—')}</div>
        <div>Location: {isLocating ? '🟡 tracking' : userLocation ? `✅ ${Math.round(userAccuracy || 0)}m` : geoError ? '❌ error' : '⚫ off'}</div>
      </div>
      
      {/* Map Container */}
      <div className="flex-1 relative">
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={savedView?.center || defaultCenter}
          zoom={savedView?.zoom || DEFAULT_ZOOM}
          heading={currentHeading}
          onLoad={handleMapLoad}
          options={mapOptions}
        >
          {/* Mask polygon - only visible in Map Mode */}
          {currentMode === 'map' && selectedAreaBounds && maskPolygonPaths.length > 0 && (
            <Polygon
              paths={maskPolygonPaths}
              options={{
                fillColor: '#000000',
                fillOpacity: 0.5,
                strokeColor: '#000000',
                strokeOpacity: 0,
                strokeWeight: 0,
                clickable: false, // CRITICAL: Allow clicks to pass through
                editable: false,
                draggable: false,
                zIndex: 100, // Below green rectangle
              }}
            />
          )}
          
          {/* Debug polylines for mask verification (auto-clear after 10s) */}
          {debugPolylines && (
            <>
              {/* Outer ring - GREEN (should be world boundary) */}
              <Polyline
                path={debugPolylines.outer}
                options={{
                  strokeColor: '#00FF00',
                  strokeOpacity: 1.0,
                  strokeWeight: 3,
                  clickable: false,
                  zIndex: 300, // Above everything for visibility
                }}
              />
              {/* Inner ring - RED (should be selection boundary) */}
              <Polyline
                path={debugPolylines.inner}
                options={{
                  strokeColor: '#FF0000',
                  strokeOpacity: 1.0,
                  strokeWeight: 3,
                  clickable: false,
                  zIndex: 301, // Above everything for visibility
                }}
              />
            </>
          )}
          
          {/* Fallback: 4-rectangle mask system (if polygon hole fails) */}
          {currentMode === 'map' && selectedAreaBounds && maskRectangles.length > 0 && (
            <>
              {maskRectangles.map((rect, index) => (
                <Rectangle
                  key={`mask-rect-${index}`}
                  bounds={{
                    north: rect.north,
                    south: rect.south,
                    east: rect.east,
                    west: rect.west,
                  }}
                  options={{
                    fillColor: '#000000',
                    fillOpacity: 0.5,
                    strokeColor: '#000000',
                    strokeOpacity: 0,
                    strokeWeight: 0,
                    clickable: false, // CRITICAL: Allow clicks to pass through
                    editable: false,
                    draggable: false,
                    zIndex: 100, // Below green rectangle
                  }}
                />
              ))}
            </>
          )}
          
          {/* Show green boundary rectangle when area is defined - visible at all zoom levels */}
          {selectedAreaBounds && (
            <Rectangle
              bounds={{
                north: selectedAreaBounds.north,
                south: selectedAreaBounds.south,
                east: selectedAreaBounds.east,
                west: selectedAreaBounds.west,
              }}
              options={{
                strokeColor: '#4CAF50',
                strokeOpacity: 1.0, // Full opacity for maximum visibility
                strokeWeight: 4, // Thicker stroke for better visibility at all zoom levels
                fillColor: '#4CAF50',
                fillOpacity: 0.1, // Slightly more visible fill
                editable: false,
                draggable: false,
                clickable: false,
                // Ensure visibility at all zoom levels
                zIndex: 200, // Above mask (100) but reasonable
              }}
            />
          )}
          
          {/* Directions renderer - preserves viewport and suppresses default markers */}
          {directionsResult && (
            <DirectionsRenderer
              directions={directionsResult}
              options={{
                preserveViewport: true,
                suppressMarkers: true,
                polylineOptions: {
                  strokeColor: '#2196F3',
                  strokeWeight: 4,
                  strokeOpacity: 0.9,
                  zIndex: 1200 // Above all markers including location marker
                }
              }}
            />
          )}
          
          {/* Custom direction markers with labels */}
          {directionsPoints.length > 0 && renderDirectionsMarkers()}
          
          {/* User location marker and accuracy circle */}
          {userLocation && (
            <>
              {/* Accuracy circle - render first so it's behind the marker */}
              {userAccuracy && (
                <Circle
                  center={userLocation}
                  radius={userAccuracy}
                  options={{
                    fillColor: '#2196F3',
                    fillOpacity: 0.1,
                    strokeColor: '#2196F3',
                    strokeOpacity: 0.4,
                    strokeWeight: 2,
                    clickable: false,
                    zIndex: 50 // Below markers but above mask
                  }}
                />
              )}
              
              {/* User location marker */}
              <Marker
                position={userLocation}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  fillColor: '#2196F3',
                  fillOpacity: 1,
                  strokeColor: 'white',
                  strokeWeight: 3,
                  scale: 8
                }}
                zIndex={1100} // Above other markers
                title={`Your location (±${userAccuracy ? Math.round(userAccuracy) : '?'}m)`}
              />
            </>
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
        
        {/* Control Buttons */}
        <div className="absolute left-4 top-4 flex flex-col gap-2">
          {/* Reset View Button - Only show when boundaries are set */}
          {selectedAreaBounds && (
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
          )}
          
          {/* Test Rotation Button - Always visible for testing */}
          <Button
            onClick={() => {
              if (mapInstance) {
                const testHeading = (currentHeading + 90) % 360;
                mapInstance.setHeading(testHeading);
                setCurrentHeading(testHeading);
                localStorage.setItem('fieldMapHeading', testHeading.toString());
                console.log(`🔄 Programmatic rotation test: ${testHeading}°`);
                toast({
                  title: "Rotation Test",
                  description: `Map rotated to ${testHeading}°`,
                });
              }
            }}
            size="sm"
            variant="secondary"
            className="shadow-lg bg-white hover:bg-gray-100"
            aria-label="Test rotation"
          >
            🧭 Test Rotation
          </Button>
        </div>
        
        {/* Location button - separate from DirectionsToolbar */}
        <div className="absolute bottom-36 right-4 z-20">
          <Button
            onClick={() => {
              if (isLocating) {
                stopLocationWatch();
              } else {
                startLocationWatch();
              }
            }}
            variant={isLocating ? "destructive" : "default"}
            size="sm"
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium shadow-lg"
          >
            {isLocating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Stop
              </>
            ) : (
              <>
                📍 Locate me
              </>
            )}
          </Button>
        </div>

        {/* Floating directions toolbar */}
        <DirectionsToolbar />
      </div>

      {/* Mobile-friendly controls at bottom */}
      <div className="p-4 bg-white border-t">
        <div className="flex gap-3 justify-center">
          {!selectedAreaBounds ? (
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
          {selectedAreaBounds ? (
            <div className="space-y-1">
              <span className={`font-medium block ${currentMode === 'map' ? 'text-green-600' : 'text-blue-600'}`}>
                {currentMode === 'map' ? 'Map Mode' : 'Global Mode'} Active
              </span>
              <span className="text-xs">
                {currentMode === 'map' 
                  ? 'Constrained to 2x area • Mask outside • Click outside for Global'
                  : 'Free navigation • Click inside boundary for Map Mode'}
              </span>
              <span className="text-xs">Right-click + drag to rotate • Heading: {Math.round(currentHeading)}°</span>
            </div>
          ) : (
            <span>Define your field area for dual-zone navigation</span>
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