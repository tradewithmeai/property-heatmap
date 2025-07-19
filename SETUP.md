# Setup Instructions

## Issues Fixed

The add property function was not working due to 3 main issues:

1. **Database Authentication Policy**: The properties table required authentication for inserts
2. **Missing Google Maps API Key**: No environment variable or fallback configured  
3. **Poor Error Handling**: Limited debugging information

## Quick Fix Applied

### 1. Database Policy Fix
Created a new migration to allow public inserts (development only):
```sql
-- File: supabase/migrations/20250718000000-fix-property-insert-policy.sql
DROP POLICY IF EXISTS "Authenticated users can insert properties" ON public.properties;
CREATE POLICY "Public can insert properties" ON public.properties FOR INSERT USING (true);
```

### 2. Google Maps API Key Setup
Modified `useGoogleMapsKey.ts` to check for environment variable first, then fallback to Supabase function.

**To get your Google Maps API Key:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing
3. Enable "Maps JavaScript API"
4. Create credentials (API Key)
5. Add your API key to `.env.local`:

```env
VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
```

### 3. Enhanced Error Handling
- Added console logging to `insertProperty` function
- Improved error messages with error codes and details
- Added database connection test utility

## Testing the Fix

1. **Set your Google Maps API Key** in `.env.local`
2. **Restart the dev server**: `npm run dev`
3. **Click "Test DB"** button to verify database connection
4. **Click "Add Properties"** to enable adding mode
5. **Click anywhere on the map** to add a property

## Production Considerations

⚠️ **Important**: The current fix allows public database inserts which is not secure for production.

For production, you should:
1. Implement proper user authentication
2. Restore the authenticated-only insert policy
3. Set up proper environment variables for Google Maps API key
4. Remove console.log statements

## Project Structure

```
src/
├── components/
│   ├── PropertyMap.tsx     # Main map component with add functionality
│   └── PropertiesDemo.tsx  # Demo component for testing
├── lib/
│   ├── properties.ts       # Database operations (fixed)
│   └── testDb.ts          # Database testing utility (new)
├── hooks/
│   └── useGoogleMapsKey.ts # API key management (fixed)
└── integrations/supabase/  # Supabase configuration
```

## Next Steps

Once the add property function is working:
1. Add data visualization on the map
2. Implement property details popup
3. Add property filtering and search
4. Implement user authentication
5. Add property categories and custom markers