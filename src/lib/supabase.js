import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lieswywjbwwrcvqxzbqu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Df2HG5pJun11Qaj9W_4KIQ_Hl8RXgTW';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
