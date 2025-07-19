-- Create properties table for storing property data with location and price
CREATE TABLE public.properties (
  id BIGSERIAL PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

-- Allow public read access to properties (for displaying on maps)
CREATE POLICY "Properties are publicly readable" 
ON public.properties 
FOR SELECT 
USING (true);

-- Only authenticated users can insert properties
CREATE POLICY "Authenticated users can insert properties" 
ON public.properties 
FOR INSERT 
TO authenticated
WITH CHECK (true);