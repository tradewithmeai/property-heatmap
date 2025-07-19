import { PropertyMap } from "@/components/PropertyMap";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4">Property Management Demo</h1>
          <p className="text-xl text-muted-foreground">Supabase + React Integration</p>
        </div>
        <PropertyMap />
      </div>
    </div>
  );
};

export default Index;
