"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseAdmin = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("./env");
exports.supabaseAdmin = (0, supabase_js_1.createClient)(env_1.env.supabaseUrl, env_1.env.supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    },
    global: {
        fetch: (url, options = {}) => {
            return fetch(url, {
                ...options,
                signal: AbortSignal.timeout(15000)
            }).catch((err) => {
                if (err?.name === 'AbortError') {
                    console.error('Supabase request timeout:', url);
                }
                else if (err?.code === 'ENOTFOUND' || err?.cause?.code === 'ENOTFOUND') {
                    console.error('Supabase DNS lookup failed. Check network connection or Supabase project status.');
                }
                else {
                    console.error('Supabase fetch error:', err?.message || err);
                }
                throw err;
            });
        }
    }
});
