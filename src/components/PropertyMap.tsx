import { useState, useEffect, useCallback } from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchAllProperties, insertProperty } from '@/lib/properties';
import { useToast } from '@/hooks/use-toast';
import { useGoogleMapsKey } from '@/hooks/useGoogleMapsKey';
import { testDatabaseConnection } from '@/lib/testDb';

interface Property {
  id: number;
  latitude: number;
  longitude: number;
  price: number;
  created_at: string;
}

const containerStyle = {
  width: '100%',
  height: '500px'
};

// London coordinates
const center = {
  lat: 51.505,
  lng: -0.09
};

interface MapWithLoaderProps {
  apiKey: string;
}

function MapWithLoader({ apiKey }: MapWithLoaderProps) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const { toast } = useToast();

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries: ['maps']
  });

  // Load properties on component mount (disabled for now)
  // useEffect(() => {
  //   loadProperties();
  // }, []);

  const loadProperties = async () => {
    try {
      setLoading(true);
      const data = await fetchAllProperties();
      setProperties(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load properties",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMapClick = useCallback((event: google.maps.MapMouseEvent) => {
    if (!isAddingMode || !event.latLng) return;

    const latitude = event.latLng.lat();
    const longitude = event.latLng.lng();
    const randomPrice = Math.floor(Math.random() * 1000000) + 200000;

    // Create a temporary property object for display
    const newProperty: Property = {
      id: Date.now(), // Use timestamp as temporary ID
      latitude,
      longitude,
      price: randomPrice,
      created_at: new Date().toISOString()
    };

    setProperties(prev => [newProperty, ...prev]);
    
    toast({
      title: "Success",
      description: `Marker placed at £${randomPrice.toLocaleString()}!`
    });
  }, [isAddingMode, toast]);

  const handleTestDatabase = async () => {
    const result = await testDatabaseConnection();
    toast({
      title: result.success ? "Database Test Passed" : "Database Test Failed",
      description: result.success 
        ? `Found ${result.propertiesCount} properties in database` 
        : result.error,
      variant: result.success ? "default" : "destructive"
    });
  };

  if (renderError) {
    return (
      <div className="flex flex-col justify-center items-center h-96 p-4">
        <p className="text-red-500 font-semibold mb-2">Render Error:</p>
        <p className="text-sm text-muted-foreground text-center">{renderError}</p>
        <Button 
          variant="outline" 
          onClick={() => setRenderError(null)} 
          className="mt-4"
        >
          Try Again
        </Button>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col justify-center items-center h-96 p-4">
        <p className="text-red-500 font-semibold mb-2">Maps Load Error:</p>
        <p className="text-sm text-muted-foreground text-center">{loadError.message}</p>
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="flex justify-center items-center h-96">Loading Google Maps...</div>;
  }

  try {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Property Map - London</CardTitle>
              <div className="space-x-2">
                <Button
                  variant={isAddingMode ? "default" : "outline"}
                  onClick={() => setIsAddingMode(!isAddingMode)}
                >
                  {isAddingMode ? "Stop Adding" : "Add Properties"}
                </Button>
                <Button variant="secondary" onClick={loadProperties} disabled={loading}>
                  {loading ? "Loading..." : "Refresh"}
                </Button>
                <Button variant="outline" onClick={handleTestDatabase}>
                  Test DB
                </Button>
              </div>
            </div>
            {isAddingMode && (
              <p className="text-sm text-muted-foreground">
                Click anywhere on the map to add a new property
              </p>
            )}
          </CardHeader>
          <CardContent>
            <GoogleMap
              mapContainerStyle={containerStyle}
              center={center}
              zoom={12}
              onClick={handleMapClick}
            >
              {properties && properties.length > 0 && properties.map((property) => (
                <Marker
                  key={property.id}
                  position={{
                    lat: property.latitude,
                    lng: property.longitude
                  }}
                  title={`£${property.price.toLocaleString()}`}
                  onClick={() => {
                    toast({
                      title: "Property Details",
                      description: `Price: £${property.price.toLocaleString()}\nAdded: ${new Date(property.created_at).toLocaleDateString()}`
                    });
                  }}
                />
              ))}
            </GoogleMap>
          </CardContent>
        </Card>
        
        <div className="text-center text-sm text-muted-foreground">
          Showing {properties?.length || 0} properties on the map
        </div>
      </div>
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown render error';
    setRenderError(errorMessage);
    console.error('MapWithLoader render error:', error);
    return (
      <div className="flex flex-col justify-center items-center h-96 p-4">
        <p className="text-red-500 font-semibold mb-2">Render Error:</p>
        <p className="text-sm text-muted-foreground text-center">{errorMessage}</p>
        <Button 
          variant="outline" 
          onClick={() => window.location.reload()} 
          className="mt-4"
        >
          Reload Page
        </Button>
      </div>
    );
  }
}

export function PropertyMap() {
  const { apiKey, loading: keyLoading, error: keyError } = useGoogleMapsKey();

  if (keyLoading) {
    return <div className="flex justify-center items-center h-96">Waiting for API key...</div>;
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

  return <MapWithLoader apiKey={apiKey} />;
}