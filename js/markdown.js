/* A small Markdown renderer for update posts — the landing page's Latest &
 * News and each creator's own updates.
 *
 *   Markdown.render(text)   safe HTML for that text
 *
 * Update text is typed by people, so nothing in it is ever treated as markup:
 * everything is escaped first, and only the Markdown below turns into tags.
 *
 *   # Heading, ## Smaller, ### Smaller still
 *   **bold**  __bold__  *italic*  _italic_  ~~struck~~  `code`
 *   [link text](https://example.com)   bare https://… links still work
 *   - bullet / * bullet / + bullet      1. numbered
 *   > quote                             --- (a dividing line)
 *
 * A blank line starts a new paragraph; single line breaks are kept, as they
 * always were. Links only go to http(s), mailto: or a path on this site.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  // http(s), mailto and site-relative only; javascript:, data: and the rest
  // are dropped, and the link text is shown on its own.
  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return '';
    return u;
  }

  function link(href, inner) {
    var external = !/^(\/|#|\.)/.test(href) || /^\/\//.test(href);
    return '<a href="' + esc(href) + '"' +
      (external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + inner + '</a>';
  }

  // Code, links and bare URLs are set aside as placeholders first, so the
  // emphasis rules never reach inside them (an _ in a URL stays an _).
  function inline(s, noLinks) {
    var held = [];
    function hold(html) { held.push(html); return '\u0000' + (held.length - 1) + '\u0000'; }

    s = String(s).replace(/\u0000/g, '');
    s = s.replace(/`([^`\n]+)`/g, function (_, code) { return hold('<code>' + esc(code) + '</code>'); });
    if (!noLinks) {
      s = s.replace(/\[([^\]\n]+)\]\(\s*([^()\s]+(?:\([^()\s]*\)[^()\s]*)*)\s*\)/g, function (all, text, url) {
        var href = safeUrl(url);
        return hold(href ? link(href, inline(text, true)) : inline(text, true));
      });
      s = s.replace(/https?:\/\/[^\s<>"\u0000]+/g, function (u) {
        var trail = '', m = u.match(/[.,;:!?)\]]+$/);
        if (m) { trail = m[0]; u = u.slice(0, -trail.length); }
        return hold(link(u, esc(u))) + trail;
      });
    }

    s = esc(s)
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>')
      .replace(/\*(?=[^\s*])([^*]*?[^\s*])\*/g, '<em>$1</em>')
      .replace(/(^|[^\w])_(?=[^\s_])([^_]*?[^\s_])_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
      .replace(/\r?\n/g, '<br>');

    return s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return held[+i]; });
  }

  function render(text) {
    var lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    var out = [], para = [], list = null, quote = [];

    function flushPara() { if (para.length) { out.push('<p>' + inline(para.join('\n')) + '</p>'); para = []; } }
    function flushList() {
      if (list) { out.push('<' + list.tag + '>' + list.items.map(function (i) { return '<li>' + inline(i) + '</li>'; }).join('') + '</' + list.tag + '>'); list = null; }
    }
    function flushQuote() { if (quote.length) { out.push('<blockquote>' + inline(quote.join('\n')) + '</blockquote>'); quote = []; } }
    function flush() { flushPara(); flushList(); flushQuote(); }

    lines.forEach(function (line) {
      var m;
      if (!line.trim()) { flush(); return; }
      if ((m = /^\s{0,3}(#{1,3})\s+(.*?)\s*#*\s*$/.exec(line))) {
        flush(); out.push('<h' + (m[1].length + 2) + '>' + inline(m[2]) + '</h' + (m[1].length + 2) + '>'); return;
      }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); return; }
      if ((m = /^\s{0,3}>\s?(.*)$/.exec(line))) { flushPara(); flushList(); quote.push(m[1]); return; }
      var ul = /^\s{0,3}[-*+]\s+(.*)$/.exec(line), ol = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/.exec(line);
      if (ul || ol) {
        var tag = ul ? 'ul' : 'ol';
        flushPara(); flushQuote();
        if (list && list.tag !== tag) flushList();
        if (!list) list = { tag: tag, items: [] };
        list.items.push((ul || ol)[1]);
        return;
      }
      // A plain line straight after a list item carries that item on.
      if (list && /^\s+\S/.test(line)) { list.items[list.items.length - 1] += '\n' + line.trim(); return; }
      flushList(); flushQuote();
      para.push(line);
    });
    flush();
    return out.join('');
  }

  window.Markdown = { render: render };
})();
