/** Read every bounded page or fail; never return a silently partial calendar. */
export async function readCalendarPages<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 500,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await read(from, from + pageSize - 1);
    if (page.error)
      throw new Error("Kalender konnte nicht vollständig geladen werden.");
    const data = page.data ?? [];
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}
