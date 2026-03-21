"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)('https://cdngdscyhbwnukeducqo.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkbmdkc2N5aGJ3bnVrZWR1Y3FvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI4NTExMCwiZXhwIjoyMDg1ODYxMTEwfQ.p4yneq1sNKS8X1kLAX5Ro9NN4VlqEek1_X9pOIgQqqs');
async function run() {
    const { data, error } = await supabase.from('winners').select('*').limit(20);
    console.log(JSON.stringify(data, null, 2));
}
run();
