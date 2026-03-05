-- Default settings for Phase 8 features
INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES ('keyboard_shortcuts', '{}', datetime('now'));

INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES ('theme_settings', '{"mode":"system","accent_color":"#3b82f6"}', datetime('now'));

INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES ('version_history', '{"enabled":true,"max_versions_per_note":50,"auto_prune":true,"snapshot_debounce_secs":5}', datetime('now'));

INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES ('global_hotkey', 'Ctrl+Shift+Space', datetime('now'));
