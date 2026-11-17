#!/bin/sh
set -eu

RUNTIME_CONFIG_PATH="${RUNTIME_CONFIG_PATH:-/usr/share/nginx/html/runtime-config.js}"
TMP_CONFIG_PATH="${RUNTIME_CONFIG_PATH}.tmp.$$"

cleanup_tmp() {
  rm -f "$TMP_CONFIG_PATH"
}
trap cleanup_tmp EXIT HUP INT TERM

json_escape_string() {
  RAW_VAL="$1" awk '
    BEGIN {
      s = ENVIRON["RAW_VAL"];
      out = "\"";
      n = length(s);
      for (i = 1; i <= n; i++) {
        c = substr(s, i, 1);
        if (c == "\\") out = out "\\\\";
        else if (c == "\"") out = out "\\\"";
        else if (c == "\n") out = out "\\n";
        else if (c == "\r") out = out "\\r";
        else if (c == "\t") out = out "\\t";
        else if (c == "\b") out = out "\\b";
        else if (c == "\f") out = out "\\f";
        else if (c == "<") out = out "\\u003c";
        else if (c == ">") out = out "\\u003e";
        else out = out c;
      }
      out = out "\"";
      printf "%s", out;
    }
  '
}

SUPABASE_URL_VAL="${VITE_SUPABASE_URL:-}"
SUPABASE_ANON_VAL="${VITE_SUPABASE_ANON_KEY:-}"

case "$SUPABASE_URL_VAL" in
  http://*|https://*)
    ;;
  "")
    echo "[SpendWise Client] Warning: VITE_SUPABASE_URL is not set; Supabase client auth will remain unconfigured." >&2
    SUPABASE_URL_VAL=""
    SUPABASE_ANON_VAL=""
    ;;
  *)
    echo "[SpendWise Client] Warning: VITE_SUPABASE_URL is not a valid http(s) URL; disabling runtime Supabase config." >&2
    SUPABASE_URL_VAL=""
    SUPABASE_ANON_VAL=""
    ;;
esac

if [ -n "$SUPABASE_URL_VAL" ] && [ -z "$SUPABASE_ANON_VAL" ]; then
  echo "[SpendWise Client] Warning: VITE_SUPABASE_ANON_KEY is not set; Supabase client auth will remain unconfigured." >&2
  SUPABASE_URL_VAL=""
fi

JSON_URL="$(json_escape_string "$SUPABASE_URL_VAL")"
JSON_ANON="$(json_escape_string "$SUPABASE_ANON_VAL")"

cat > "$TMP_CONFIG_PATH" <<EOF
window.__SPENDWISE_RUNTIME_CONFIG__ = {
  supabaseUrl: ${JSON_URL},
  supabaseAnonKey: ${JSON_ANON}
};
EOF

chmod 0644 "$TMP_CONFIG_PATH"
mv -f "$TMP_CONFIG_PATH" "$RUNTIME_CONFIG_PATH"
