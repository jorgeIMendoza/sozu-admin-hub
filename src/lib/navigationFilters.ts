import type { NavigateFunction } from 'react-router-dom';

export interface FilterParams { [key: string]: string; }

export function navigateWithFilters(
  navigate: NavigateFunction, destination: string,
  filters: FilterParams = {}, options?: { replace?: boolean }
) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== 'all') params.set(key, value);
  });
  const search = params.toString();
  navigate(`${destination}${search ? `?${search}` : ''}`, { replace: options?.replace });
}
