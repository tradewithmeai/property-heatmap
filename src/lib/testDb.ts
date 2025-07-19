import { supabase } from "@/integrations/supabase/client";

export async function testDatabaseConnection() {
  try {
    console.log('Testing database connection...');
    
    // Test basic connection
    const { data: connectionTest, error: connectionError } = await supabase
      .from('properties')
      .select('count')
      .limit(1);
    
    if (connectionError) {
      console.error('Database connection failed:', connectionError);
      return { success: false, error: connectionError.message };
    }
    
    console.log('Database connection successful');
    
    // Test if we can read from properties table
    const { data: readTest, error: readError } = await supabase
      .from('properties')
      .select('*')
      .limit(1);
    
    if (readError) {
      console.error('Database read failed:', readError);
      return { success: false, error: readError.message };
    }
    
    console.log('Database read test successful, found', readTest?.length || 0, 'properties');
    
    return { success: true, propertiesCount: readTest?.length || 0 };
    
  } catch (error) {
    console.error('Database test failed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}