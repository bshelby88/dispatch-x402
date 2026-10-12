"use strict";
// Dependency-free, Express-compatible trust pages: /terms /privacy /refunds /contact
// plus a gated trust section appended to /llms.txt.
// Nothing is served unless SELLER_LEGAL_NAME and SUPPORT_EMAIL are both set AND the
// text file has no remaining "[BRYANT" required-fill marker. Mount ABOVE paid middleware.
const fs = require("node:fs");
const path = require("node:path");

const PAGES = { "/terms": "terms.md", "/privacy": "privacy.md", "/refunds": "refunds.md", "/contact": "contact.md" };
const MARKER = "[BRYANT";

function readEnv(env) {
  const name = String(env.SELLER_LEGAL_NAME || "").trim();
  const email = String(env.SUPPORT_EMAIL || "").trim();
  // reject empty, control chars/newlines, absurd length, non-email
  if (!name || !email) return null;
  if (/[\u0000-\u001f\u007f]/.test(name + email) || name.length > 200) return null;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  return { name, email };
}

function render(text, v) {
  // function replacers: '$' in values is never interpreted
  return text.replace(/\{\{SELLER_LEGAL_NAME\}\}/g, () => v.name).replace(/\{\{SUPPORT_EMAIL\}\}/g, () => v.email);
}

function create(opts = {}) {
  const dir = opts.dir || path.join(__dirname, "trust");
  const env = opts.env || process.env;
  const passThrough = !!opts.passThrough; // true: fall through (next) instead of 404 when not ready

  function load(file) {
    let raw;
    try { raw = fs.readFileSync(path.join(dir, file), "utf8"); } catch (_) { return null; }
    if (raw.includes(MARKER)) return null; // unfilled placeholder text: refuse
    return raw;
  }

  function page(p) {
    const v = readEnv(env);
    if (!v || !PAGES[p]) return null;
    const raw = load(PAGES[p]);
    return raw === null ? null : render(raw, v);
  }

  // Trust section for llms.txt; "" unless env set and its template is clean.
  function llmsSection() {
    const v = readEnv(env);
    if (!v) return "";
    const raw = load("llms-trust.txt");
    return raw === null ? "" : "\n" + render(raw, v).replace(/\s+$/, "") + "\n";
  }

  function handler(req, res, next) {
    const method = req.method;
    const p = String(req.url || "").split("?")[0].replace(/(.)\/+$/, "$1");
    if ((method === "GET" || method === "HEAD") && p === "/llms.txt") {
      const extra = llmsSection();
      if (extra && typeof res.send === "function") {
        const orig = res.send.bind(res);
        res.send = (body) => (typeof body === "string" ? orig(body.replace(/\s+$/, "") + "\n" + extra) : orig(body));
      }
      return next();
    }
    if (!PAGES[p]) return next();
    if (method !== "GET" && method !== "HEAD") return next();
    const body = page(p);
    if (body === null) {
      if (passThrough) return next();
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end("Not found\n");
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.end(method === "HEAD" ? undefined : body);
  }
  handler.llmsSection = llmsSection;
  handler.page = page;
  return handler;
}

module.exports = create();
module.exports.create = create;
module.exports.PAGES = PAGES;
module.exports.MARKER = MARKER;
