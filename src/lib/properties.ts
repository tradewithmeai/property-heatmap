import { supabase } from "@/integrations/supabase/client";

export interface Property {
  id: number;
  latitude: number;
  longitude: number;
  price: number;
  created_at: string;
}

export interface PropertyInsert {
  latitude: number;
  longitude: number;
  price: number;
}

/**
 * Insert a new property into the database
 */
export async function insertProperty({ latitude, longitude, price }: PropertyInsert) {
  console.log('Attempting to insert property:', { latitude, longitude, price });
  
  const { data, error } = await supabase
    .from('properties')
    .insert([{ latitude, longitude, price }])
    .select()
    .single();

  if (error) {
    console.error('Supabase insert error:', error);
    throw new Error(`Failed to insert property: ${error.message}. Code: ${error.code}, Details: ${error.details}`);
  }

  console.log('Successfully inserted property:', data);
  return data as Property;
}

/**
 * Fetch all properties from the database
 */
export async function fetchAllProperties(): Promise<Property[]> {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch properties: ${error.message}`);
  }

  return data as Property[];
}