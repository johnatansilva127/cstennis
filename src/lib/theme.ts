export const THEME_COOKIE = "cs-theme";
export type ThemePreference = "system" | "light" | "dark";

export function parseTheme(value: string | undefined | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
