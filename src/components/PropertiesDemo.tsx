import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { insertProperty, fetchAllProperties } from '@/lib/properties';
import { useToast } from '@/hooks/use-toast';

interface Property {
  id: number;
  latitude: number;
  longitude: number;
  price: number;
  created_at: string;
}

export function PropertiesDemo() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Load properties on component mount
  useEffect(() => {
    loadProperties();
  }, []);

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

  const handleAddProperty = async () => {
    try {
      // Example coordinates (NYC area) and random price
      const latitude = 40.7128 + (Math.random() - 0.5) * 0.1;
      const longitude = -74.0060 + (Math.random() - 0.5) * 0.1;
      const price = Math.floor(Math.random() * 1000000) + 200000;

      const newProperty = await insertProperty({ latitude, longitude, price });
      setProperties(prev => [newProperty, ...prev]);
      
      toast({
        title: "Success",
        description: "Property added successfully!"
      });
    } catch (error) {
      toast({
        title: "Error", 
        description: "Failed to add property. Please login first.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Properties Demo</h2>
        <Button onClick={handleAddProperty}>
          Add Random Property
        </Button>
      </div>

      {loading ? (
        <p>Loading properties...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {properties.map((property) => (
            <Card key={property.id}>
              <CardHeader>
                <CardTitle>${property.price.toLocaleString()}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p><strong>Lat:</strong> {property.latitude.toFixed(4)}</p>
                <p><strong>Lng:</strong> {property.longitude.toFixed(4)}</p>
                <p><strong>Added:</strong> {new Date(property.created_at).toLocaleDateString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {properties.length === 0 && !loading && (
        <p className="text-center text-muted-foreground">
          No properties yet. Add one to get started!
        </p>
      )}
    </div>
  );
}