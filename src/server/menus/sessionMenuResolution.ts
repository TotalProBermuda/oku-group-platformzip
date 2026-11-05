export function resolveSessionMenuLinks<T>(sessionMenus: T[], seriesMenus: T[]): T[] {
  return sessionMenus.length > 0 ? sessionMenus : seriesMenus;
}
