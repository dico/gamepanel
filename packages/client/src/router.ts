type RouteHandler = (params: Record<string, string>) => void;

interface Route {
  pattern: RegExp;
  keys: string[];
  handler: RouteHandler;
}

const routes: Route[] = [];
let notFoundHandler: RouteHandler = () => {};

export function route(path: string, handler: RouteHandler): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' + path.replace(/:([^/]+)/g, (_, key) => {
      keys.push(key);
      return '([^/]+)';
    }) + '$'
  );
  routes.push({ pattern, keys, handler });
}

export function notFound(handler: RouteHandler): void {
  notFoundHandler = handler;
}

export function navigate(path: string): void {
  history.pushState(null, '', path);
  resolve();
}

export function resolve(): void {
  const path = location.pathname;
  for (const r of routes) {
    const match = path.match(r.pattern);
    if (match) {
      const params: Record<string, string> = {};
      r.keys.forEach((key, i) => { params[key] = match[i + 1]; });
      r.handler(params);
      return;
    }
  }
  notFoundHandler({});
}

// Intercept link clicks for SPA navigation
document.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('a');
  if (!target) return;
  const href = target.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('#')) return;
  e.preventDefault();
  navigate(href);
});

// Handle back/forward
window.addEventListener('popstate', () => resolve());
