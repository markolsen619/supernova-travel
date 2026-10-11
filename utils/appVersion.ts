/** Settings → About's version: "1.0.4 (33)" — the build tells TestFlight builds apart. */
export function appVersionLabel(version: string | null, build: string | null): string {
  if (!version) return '';
  return build ? `${version} (${build})` : version;
}
