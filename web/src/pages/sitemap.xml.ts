// sitemap.xml built from index.json: the directory renders in the browser, so this is how crawlers reach every profile.
import type { APIRoute } from "astro";
import type { IndexEntry } from "../lib/data";
import indexJson from "../../public/data/index.json";

export const GET: APIRoute = ({ site }) => {
  const index = indexJson as IndexEntry[];
  const base = (site?.href ?? "https://ufc-fighter-compare.pages.dev/").replace(/\/$/, "");
  const paths = ["/", "/fighters/", "/groups/", "/method/", ...index.map((e) => `/fighters/${e.slug}/`)];
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    paths.map((p) => `  <url><loc>${base}${p}</loc></url>`).join("\n") +
    `\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
