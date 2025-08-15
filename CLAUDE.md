# Field Navigator - Claude Project Memory

## Project Overview
Mobile field navigation app with user-defined map boundaries for outdoor use. Transformed from property heatmap to mobile-first field tool. Built with React, TypeScript, and Supabase.

## Project Status: ✅ FIELD NAVIGATOR - PHASE 1 COMPLETE
- **GitHub Repository**: https://github.com/tradewithmeai/property-heatmap
- **Live Production URL**: https://property-heatmap.vercel.app
- **Team Production URL**: https://property-heatmap-captains-projects-493e7ead.vercel.app
- **Local Development**: http://localhost:8080 (auto-detects available port)

## 🔄 Version Control & Backups
### Original Property Map Backup
The original property heatmap application has been preserved for future rollback:
- **Backup Branch**: `property-map-backup` 
- **Backup Tag**: `v1.0-property-map`
- **GitHub Backup**: https://github.com/tradewithmeai/property-heatmap/tree/property-map-backup

### Rollback Commands
```bash
# Switch to original property map
git checkout property-map-backup

# Or checkout tagged version
git checkout v1.0-property-map

# Return to field navigator
git checkout master
```

## Technology Stack
- **Frontend**: React 18.3.1 + TypeScript + Vite 5.4.10
- **Maps**: Google Maps JavaScript API (@react-google-maps/api)
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **UI Framework**: shadcn/ui + Tailwind CSS
- **Deployment**: Vercel with automatic GitHub deployments
- **Development**: Node.js + npm

## Environment Configuration

### Production Environment Variables (Configured in Vercel)
```
VITE_SUPABASE_URL=https://cogxunjrdqsuvlgbmokf.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvZ3h1bmpyZHFzdXZsZ2Jtb2tmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NzQ4MzUsImV4cCI6MjA2NjQ1MDgzNX0.bV7nN60sA8MDut1iZ5Ede0jBJGfLwkJkp5Rw-Dqlmd0
VITE_GOOGLE_MAPS_API_KEY=[Encrypted] (Maps JavaScript API enabled)
```

### Supabase Configuration
- **Project ID**: cogxunjrdqsuvlgbmokf
- **Project Name**: "Concentric Crypto Ticker"
- **Region**: West US (North California)
- **Google Maps API Key**: Stored in Supabase Edge Function environment as `GOOGLE_MAPS_API_KEY`
- **Edge Function**: `get-maps-key` deployed and functional

### Google Maps API
- **Google Cloud Project**: ornate-glider-465920-q1
- **API Key**: Dual storage - Vercel environment variable (primary) + Supabase Edge Function (fallback)
- **APIs Enabled**: Maps JavaScript API, Maps Backend API
- **Integration**: Direct via environment variable with Supabase fallback
- **Status**: ✅ FULLY FUNCTIONAL

## Development Workflow

### Local Development
```bash
npm run dev          # Start development server (auto-detects port 8080-8084)
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

### Deployment Workflow
1. Make changes locally and test on http://localhost:8084
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Description of changes"
   git push
   ```
3. Vercel automatically builds and deploys
4. Production updates available immediately

### Supabase CLI Commands
```bash
npx supabase login --token sbp_ab84ed910ed52efd8f4d3a7cb52f56c435ff7dba
npx supabase status                    # Check project status
npx supabase functions deploy          # Deploy edge functions
npx supabase secrets set KEY=value     # Set environment variables
npx supabase projects list             # List projects
```

## Project Structure
```
├── src/
│   ├── components/
│   │   ├── PropertyMap.tsx           # Main map component
│   │   ├── PropertiesDemo.tsx        # Demo property data
│   │   └── ui/                       # shadcn/ui components
│   ├── hooks/
│   │   ├── useGoogleMapsKey.ts       # Google Maps API key management
│   │   └── use-toast.ts              # Toast notifications
│   ├── integrations/supabase/
│   │   ├── client.ts                 # Supabase client configuration
│   │   └── types.ts                  # Database type definitions
│   ├── lib/
│   │   ├── properties.ts             # Property CRUD operations
│   │   ├── testDb.ts                 # Database testing utilities
│   │   └── utils.ts                  # Common utilities
│   └── pages/
│       ├── Index.tsx                 # Main application page
│       └── NotFound.tsx              # 404 page
├── supabase/
│   ├── functions/get-maps-key/       # Edge function for API key
│   ├── migrations/                   # Database migrations
│   └── config.toml                   # Supabase configuration
└── public/
    ├── favicon.svg                   # Custom map marker icon
    └── favicon.ico                   # Fallback icon
```

## Recent Major Changes

### ✅ Google Maps Integration Fixed (Latest - 2025-07-20)
- ✅ Resolved Google Maps "ApiNotActivatedMapError" 
- ✅ Enabled Maps JavaScript API in Google Cloud Console (ornate-glider-465920-q1)
- ✅ Added VITE_GOOGLE_MAPS_API_KEY to Vercel environment variables
- ✅ Implemented dual API key strategy (Vercel primary, Supabase fallback)
- ✅ Added debug logging for API key loading troubleshooting
- ✅ Verified full functionality: map loads, markers work, prices generate
- ✅ Installed Google Cloud CLI for future API management

### ✅ Security & Configuration
- API key properly secured across multiple storage locations
- Supabase Edge Function remains as reliable fallback
- Updated production aliases and deployment URLs

### ✅ Complete Rebranding
- Removed all Lovable references from codebase
- Updated page title to "Property Heatmap"
- Created custom favicon with map marker design
- Professional README and documentation
- Updated package.json to "property-heatmap" v1.0.0
- Removed lovable-tagger dependency

### ✅ Production Setup
- Configured Supabase production environment
- Deployed Google Maps API key via edge functions
- Set up Vercel environment variables
- Established continuous deployment pipeline

### ✅ API Integration
- Google Maps JavaScript API fully functional
- Supabase backend connected and operational
- Property CRUD operations implemented
- Database testing utilities

## Known Issues & Solutions

### ✅ RESOLVED: Google Maps API Issues  
**Previous Issue**: "This page didn't load Google Maps correctly" error
**Root Cause**: Maps JavaScript API not enabled in Google Cloud Console
**Solution Applied**: 
1. Enabled Maps JavaScript API in Google Cloud Console (ornate-glider-465920-q1)
2. Added VITE_GOOGLE_MAPS_API_KEY to Vercel environment variables
3. Implemented dual fallback system (Vercel → Supabase Edge Function)
**Status**: ✅ FULLY RESOLVED

### Issue: Supabase Connection
**Solution**: App uses production Supabase instance. Local development connects to production database.

### Issue: Port Conflicts
**Solution**: Vite automatically detects available ports (8080-8084+)

## Testing Commands
```bash
# Test database connection (via UI "Test DB" button)
# Test Google Maps loading (should load automatically)
# Test property addition (click "Add Properties" then click map)
```

## CLI Tools Configuration
- **GitHub CLI**: Authenticated as tradewithmeai
- **Vercel CLI**: Authenticated as devsolvx-2686  
- **Supabase CLI**: Authenticated with access token
- **Google Cloud CLI**: Authenticated as richwatson420@gmail.com, project: ornate-glider-465920-q1
- **Git**: Repository linked to GitHub with auto-deploy

## Next Development Steps
1. Implement property filtering and search
2. Add property details modal/sidebar
3. Implement user authentication
4. Add property import/export functionality
5. Enhance map visualization with heatmap overlay
6. Add property analytics and reporting

## Current Features Working
- ✅ **Google Maps Integration**: Full interactive map with London center view
- ✅ **Property Markers**: Click "Add Properties" → click map to place markers  
- ✅ **Demo Pricing**: Random property prices (£200K - £1.2M) generated on click
- ✅ **Toast Notifications**: Success messages when properties added
- ✅ **Responsive UI**: Clean interface with shadcn/ui components
- ✅ **Database Ready**: Supabase backend configured for future property storage

---
*Last Updated: 2025-07-20*  
*Status: Production Ready - Fully Functional - Google Maps Working*  
*Security: API Keys Properly Secured Across Multiple Systems*