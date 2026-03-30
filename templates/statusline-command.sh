#!/usr/bin/env bash
# AI_NAME identity status line for Claude Code
input=$(cat)
model=$(echo "$input" | jq -r '.model.display_name // "Claude"')
ctx=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

if [ -n "$ctx" ]; then
    printf 'AI_DISPLAY_NAME AI_CATCHPHRASE | %s | ctx: %.0f%%' "$model" "$ctx"
else
    printf 'AI_DISPLAY_NAME AI_CATCHPHRASE | %s' "$model"
fi
