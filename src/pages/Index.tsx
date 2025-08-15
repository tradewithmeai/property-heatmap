import { BoundedFieldMap } from "@/components/BoundedFieldMap";

const Index = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header optimized for mobile */}
      <header className="bg-white border-b px-4 py-3 shrink-0">
        <h1 className="text-xl font-bold text-center md:text-2xl">Field Navigator</h1>
        <p className="text-sm text-muted-foreground text-center">Mobile Map Tool</p>
      </header>
      
      {/* Map takes remaining space */}
      <main className="flex-1 overflow-hidden">
        <BoundedFieldMap />
      </main>
    </div>
  );
};

export default Index;
