#!/usr/bin/env bash
# Lists migration files in apply order (filename sort). Use with Supabase SQL Editor or `supabase db push`.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Apply in this order (Supabase Dashboard → SQL Editor, or supabase db push):"
ls -1 supabase/migrations/*.sql 2>/dev/null | sort || echo "(no .sql files found)"
