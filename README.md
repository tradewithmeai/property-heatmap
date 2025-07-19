# Property Heatmap

Interactive property heatmap application with Google Maps integration for real estate analysis.

## Features

- 🗺️ Interactive Google Maps integration
- 📍 Add property markers with pricing data
- 🏠 Property database with Supabase backend
- 📱 Responsive design with shadcn/ui components
- 🔄 Real-time property visualization

## Technologies

- **Frontend**: React + TypeScript + Vite
- **Maps**: Google Maps JavaScript API
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Styling**: Tailwind CSS + shadcn/ui
- **Deployment**: Vercel with automatic GitHub deployments

## Development

### Prerequisites

- Node.js & npm
- Google Maps API key
- Supabase account

### Setup

```sh
# Clone the repository
git clone https://github.com/tradewithmeai/property-heatmap.git

# Navigate to project directory
cd property-heatmap

# Install dependencies
npm install

# Start development server
npm run dev
```

### Environment Variables

The app requires the following environment variables:

- `VITE_GOOGLE_MAPS_API_KEY` - Google Maps JavaScript API key
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

### Deployment

The app is configured for automatic deployment to Vercel:

1. Push changes to the `master` branch
2. Vercel automatically builds and deploys
3. Environment variables are configured in Vercel dashboard

## Usage

1. **View Properties**: The map displays existing property markers
2. **Add Properties**: Click "Add Properties" then click on the map to place new markers
3. **Property Details**: Click markers to view property information
4. **Database Testing**: Use "Test DB" button to verify database connectivity

## License

Private project - All rights reserved