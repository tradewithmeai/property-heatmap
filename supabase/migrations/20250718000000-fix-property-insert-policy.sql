-- Drop the existing policy that requires authentication
DROP POLICY IF EXISTS "Authenticated users can insert properties" ON public.properties;

-- Create a new policy that allows public inserts (for development)
-- TODO: Replace with proper authentication in production
CREATE POLICY "Public can insert properties" 
ON public.properties 
FOR INSERT 
USING (true);