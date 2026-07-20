import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface FixtureSite {
  server: Server;
  origin: string;
  requests: Map<string, number>;
  close: () => Promise<void>;
}

function page(options: {
  title?: string;
  description?: string;
  h1?: string;
  body?: string;
  head?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  ${options.title === undefined ? "" : `<title>${options.title}</title>`}
  ${options.description === undefined ? "" : `<meta name="description" content="${options.description}">`}
  ${options.head ?? ""}
</head>
<body>
  ${options.h1 === undefined ? "" : `<h1>${options.h1}</h1>`}
  ${options.body ?? ""}
</body>
</html>`;
}

export async function createFixtureSite(port = 0): Promise<FixtureSite> {
  const requests = new Map<string, number>();
  const server = createServer((request, response) => {
    const host = request.headers.host ?? "localhost";
    const url = new URL(request.url ?? "/", `http://${host}`);
    requests.set(url.pathname, (requests.get(url.pathname) ?? 0) + 1);
    const html = (status: number, content: string) => {
      response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      response.end(request.method === "HEAD" ? undefined : content);
    };

    if (url.pathname === "/robots.txt") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("User-agent: *\nDisallow: /blocked\nAllow: /blocked/public\n");
      return;
    }
    if (url.pathname === "/sitemap.xml") {
      response.writeHead(200, { "content-type": "application/xml" });
      response.end(`<?xml version="1.0"?><urlset>${Array.from({ length: 105 }, (_, i) => `<url><loc>http://${host}/page-${i + 1}</loc></url>`).join("")}</urlset>`);
      return;
    }
    if (url.pathname === "/") {
      const numbered = Array.from({ length: 105 }, (_, i) => `<a href="/page-${i + 1}">Fixture page ${i + 1}</a>`).join("\n");
      html(200, page({
        title: "Fixture home",
        description: "Crawler integration fixture home page.",
        h1: "Fixture home",
        head: '<link rel="canonical" href="/">',
        body: `${numbered}
          <a href="/page-1#section">Duplicate fragment discovery</a>
          <a href="/redirect-start">Redirect chain</a>
          <a href="/missing">Broken internal destination</a>
          <a href="/server-error">Server error destination</a>
          <a href="/blocked">Robots blocked destination</a>
          <a href="/noindex">Noindex page</a>
          <a href="/missing-title">Missing title fixture</a>
          <a href="/empty-title">Empty title fixture</a>
          <a href="/multiple-title">Multiple title fixture</a>
          <a href="/missing-description">Missing description fixture</a>
          <a href="/no-h1">Missing H1 fixture</a>
          <a href="/duplicate-a">Duplicate A</a>
          <a href="/duplicate-b">Duplicate B</a>
          <a href="/bad-canonical">Canonical target fixture</a>
          <a href="/page-2">Click here</a>
          <a href="http://127.0.0.1:${(server.address() as AddressInfo).port}/external-target">Recorded external link</a>
          <img src="/image.png" alt="Fixture pixel" width="1" height="1">
          <img src="/missing-image.png" alt="Broken fixture image">`
      }));
      return;
    }
    const numberedMatch = /^\/page-(\d+)$/.exec(url.pathname);
    if (numberedMatch) {
      const number = Number(numberedMatch[1]);
      if (number < 1 || number > 105) {
        html(404, page({ title: "Not found", h1: "Not found" }));
        return;
      }
      const next = number < 105 ? `<a href="/page-${number + 1}">Next fixture page</a>` : '<a href="/">Fixture home</a>';
      html(200, page({
        title: `Fixture page ${number}`,
        description: `Metadata for deterministic fixture page ${number}.`,
        h1: `Fixture page ${number}`,
        head: `<link rel="canonical" href="/page-${number}">`,
        body: `<h2 id="section">Section ${number}</h2><p>This fixture page contains enough readable words for metadata extraction and hashing.</p>${next}`
      }));
      return;
    }
    if (url.pathname === "/redirect-start") {
      response.writeHead(301, { location: "/redirect-middle" });
      response.end();
      return;
    }
    if (url.pathname === "/redirect-middle") {
      response.writeHead(302, { location: "/redirect-target" });
      response.end();
      return;
    }
    if (url.pathname === "/redirect-target") {
      html(200, page({ title: "Redirect destination", description: "Final redirect page.", h1: "Redirect destination" }));
      return;
    }
    if (url.pathname === "/noindex") {
      html(200, page({ title: "Noindex page", h1: "Noindex page", head: '<meta name="robots" content="noindex,follow">' }));
      return;
    }
    if (url.pathname === "/missing-title") {
      html(200, page({ description: "A page intentionally missing a title.", h1: "Missing title fixture" }));
      return;
    }
    if (url.pathname === "/empty-title") {
      html(200, page({ title: "", description: "", h1: "Empty metadata fixture" }));
      return;
    }
    if (url.pathname === "/multiple-title") {
      html(200, page({ title: "First title", description: "Multiple title test fixture.", h1: "Multiple title fixture", head: "<title>Second title</title>" }));
      return;
    }
    if (url.pathname === "/missing-description") {
      html(200, page({ title: "Missing description fixture", h1: "Missing description fixture" }));
      return;
    }
    if (url.pathname === "/no-h1") {
      html(200, page({ title: "No H1 fixture", description: "A page intentionally missing an H1.", body: "<h2>Only a secondary heading</h2>" }));
      return;
    }
    if (url.pathname === "/duplicate-a" || url.pathname === "/duplicate-b") {
      html(200, page({ title: "Duplicate fixture", description: "Identical content for duplicate-group testing.", h1: "Duplicate fixture", body: "<p>This page intentionally has the same visible content and markup as its paired page.</p>" }));
      return;
    }
    if (url.pathname === "/bad-canonical") {
      html(200, page({ title: "Bad canonical fixture", description: "Canonical target checks.", h1: "Bad canonical fixture", head: '<link rel="canonical" href="/redirect-start">' }));
      return;
    }
    if (url.pathname === "/blocked" || url.pathname === "/blocked/public") {
      html(200, page({ title: "Robots fixture", h1: "Robots fixture" }));
      return;
    }
    if (url.pathname === "/server-error") {
      html(500, page({ title: "Server error", h1: "Server error" }));
      return;
    }
    if (url.pathname === "/external-target") {
      html(204, "");
      return;
    }
    if (url.pathname === "/image.png") {
      response.writeHead(200, { "content-type": "image/png", "content-length": "0" });
      response.end();
      return;
    }
    html(404, page({ title: "Not found", description: "Fixture 404.", h1: "Not found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    server,
    origin: `http://localhost:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
