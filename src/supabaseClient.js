import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://eirnczqtozbxpzscfhfi.supabase.co/"
const supabaseAnonKey = "sb_publishable_bZ1L3d5fjvNCHxnukW0cVg_ZzeM9uS8";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
