/**
 * Lists the public-schema functions whose names carry a legacy brand prefix.
 *
 * The names are a live contract: the application calls them by name, and the
 * database only has the names the migrations created. This probe is read-only.
 */

import 'dotenv/config';

const PROJECT_REF = 'ciihprsfdojzvjnqgbxl';
const token = process.env.SUPABASE_ACCESS_TOKEN;

const query = `
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname like '%daily_credit_allowance%'
    or p.proname like '%egypt%'
    or p.proname like '%active_plan_code%'
    or p.proname like '%set_updated_at%'
    or p.proname like '%handle_new_user%'
  )
order by 1;
`;

const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
});

console.log('status', response.status);
const text = await response.text();
console.log(text);
