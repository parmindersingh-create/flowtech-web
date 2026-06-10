/**
 * Safely converts any axios/fetch error response into a single string.
 * Handles FastAPI's 422 `detail` array (array of {type, loc, msg, input, url})
 * which crashes React (error #31) if rendered directly.
 */
export const parseApiError = (err, fallback = 'Something went wrong') => {
  const data = err?.response?.data;
  const detail = data?.detail ?? data?.message ?? data;

  if (detail == null) return err?.message || fallback;
  if (typeof detail === 'string') return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (typeof d === 'string') return d;
        if (d?.msg) {
          const loc = Array.isArray(d.loc) ? d.loc.join('.') : '';
          return loc ? `${loc}: ${d.msg}` : d.msg;
        }
        try { return JSON.stringify(d); } catch { return String(d); }
      })
      .join('; ');
  }

  if (typeof detail === 'object') {
    if (detail.msg) return String(detail.msg);
    try { return JSON.stringify(detail); } catch { return fallback; }
  }

  return String(detail) || fallback;
};
