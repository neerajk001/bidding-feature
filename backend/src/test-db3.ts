import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const supabase = createClient(
    'https://cdngdscyhbwnukeducqo.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkbmdkc2N5aGJ3bnVrZWR1Y3FvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI4NTExMCwiZXhwIjoyMDg1ODYxMTEwfQ.p4yneq1sNKS8X1kLAX5Ro9NN4VlqEek1_X9pOIgQqqs'
)

async function run() {
    const { data, error } = await supabase.from('winners').select('*').limit(20)
    fs.writeFileSync('out3.json', JSON.stringify(data, null, 2), 'utf8')
}
run()
