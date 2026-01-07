import { createClient } from "@supabase/supabase-js";

const supabaseUrl = 'https://jgucdulhqsnsovamquvp.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndWNkdWxocXNuc292YW1xdXZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2OTM1MDksImV4cCI6MjA4MzI2OTUwOX0.OqKmWIKmGqKjnV000vJ1Ur9wSpXFGcLcTaQfh3jRIC4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);